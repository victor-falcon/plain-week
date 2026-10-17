import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from 'vite-plus/test';
import { db, wipeLocalDatabase } from '@/lib/db/database';
import { createTask } from '@/lib/db/tasks';
import { createFakeLocks } from '@/test/fake-locks';
import { SyncEngine } from './engine';
import type { SyncEngineOptions, SyncEnvironment } from './engine';
import { SyncHttpError } from './transport';
import type { SyncTransport } from './transport';

/**
 * Retries, timeouts and triggers, with fake timers and a scripted transport.
 * IndexedDB (fake-indexeddb) keeps running on real `setImmediate`.
 */

function createEnvironment() {
    const listeners = new Map<string, Set<() => void>>();
    const environment: SyncEnvironment & {
        online: boolean;
        visible: boolean;
        emit(type: string): void;
    } = {
        online: true,
        visible: true,
        isOnline: () => environment.online,
        isVisible: () => environment.visible,
        addEventListener: (type, listener) => {
            listeners.set(
                type,
                (listeners.get(type) ?? new Set()).add(listener),
            );
        },
        removeEventListener: (type, listener) => {
            listeners.get(type)?.delete(listener);
        },
        emit: (type) => listeners.get(type)?.forEach((listener) => listener()),
    };

    return environment;
}

/** Every request answers with `outcome`: success, an error, or never. */
function createTransport() {
    const state = {
        outcome: 'ok' as 'ok' | 'hang' | Error,
        requests: 0,
        pushes: 0,
        signals: [] as AbortSignal[],
    };

    function answer<T>(value: T, signal?: AbortSignal): Promise<T> {
        state.requests++;

        if (signal) {
            state.signals.push(signal);
        }

        if (state.outcome === 'hang') {
            return new Promise<T>(() => {});
        }

        return state.outcome === 'ok'
            ? Promise.resolve(value)
            : Promise.reject(state.outcome);
    }

    const transport: SyncTransport = {
        push: (tasks, signal) => {
            state.pushes++;

            return answer(
                { applied: tasks.map((t) => t.id), rejected: [], cursor: 0 },
                signal,
            );
        },
        pull: (cursor, _limit, signal) =>
            answer({ tasks: [], cursor, has_more: false }, signal),
    };

    return { state, transport };
}

/** Lets IndexedDB and pending promises run (real macrotasks). */
async function flush() {
    for (let i = 0; i < 50; i++) {
        await new Promise((resolve) => setImmediate(resolve));
    }
}

async function advance(ms: number) {
    await vi.advanceTimersByTimeAsync(ms);
    await flush();
}

let environment: ReturnType<typeof createEnvironment>;
let server: ReturnType<typeof createTransport>;
let engine: SyncEngine;

function createEngine(options: Partial<SyncEngineOptions> = {}) {
    engine.stop();
    engine = new SyncEngine({
        db,
        transport: server.transport,
        environment,
        intervalMs: 60 * 60_000,
        retryBaseMs: 2000,
        // No jitter: each delay is half the backoff.
        random: () => 0,
        ...options,
    });

    return engine;
}

async function start() {
    engine.start(1);
    await flush();
}

beforeEach(async () => {
    await wipeLocalDatabase();
    vi.useFakeTimers({
        toFake: [
            'setTimeout',
            'clearTimeout',
            'setInterval',
            'clearInterval',
            'Date',
        ],
    });
    environment = createEnvironment();
    server = createTransport();
    engine = new SyncEngine({ db, transport: server.transport });
    createEngine();
});

afterEach(() => {
    engine.stop();
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

describe('automatic retries', () => {
    it('retries a server error on its own with growing delays, then recovers', async () => {
        server.state.outcome = new SyncHttpError(500);
        await start();

        expect(server.state.requests).toBe(1);
        // Still trying: not an error yet.
        expect(engine.getStatus()).toBe('syncing');

        await advance(999);
        expect(server.state.requests).toBe(1);
        await advance(1);
        expect(server.state.requests).toBe(2);

        await advance(1999);
        expect(server.state.requests).toBe(2);
        await advance(1);
        expect(server.state.requests).toBe(3);

        server.state.outcome = 'ok';
        await advance(4000);
        expect(server.state.requests).toBe(4);
        expect(engine.getStatus()).toBe('idle');

        // A success resets the backoff.
        server.state.outcome = new SyncHttpError(503);
        await engine.sync();
        await advance(1000);
        expect(server.state.requests).toBe(6);
    });

    it('doubles the delay up to five minutes, with jitter', async () => {
        createEngine({ random: () => 1 });
        server.state.outcome = new SyncHttpError(500);
        await start();

        for (let failure = 1; failure <= 10; failure++) {
            const delay = Math.min(2000 * 2 ** (failure - 1), 5 * 60_000);
            const before = server.state.requests;

            await advance(delay - 1);
            expect(server.state.requests).toBe(before);
            await advance(1);
            expect(server.state.requests).toBe(before + 1);
        }
    });

    it('turns to error only once transient failures last a while', async () => {
        createEngine({ errorAfterMs: 10_000 });
        server.state.outcome = new SyncHttpError(502);
        await start();

        // Retries at 1 s, 3 s, 7 s: still trying.
        await advance(1000);
        await advance(2000);
        await advance(4000);
        expect(server.state.requests).toBe(4);
        expect(engine.getStatus()).toBe('syncing');

        // The retry at 15 s fails too: now it is an error.
        await advance(8000);
        expect(server.state.requests).toBe(5);
        expect(engine.getStatus()).toBe('error');

        // And it keeps retrying.
        await advance(16_000);
        expect(server.state.requests).toBe(6);
    });

    it('reports a failure that is not transient as an error at once, and still retries it', async () => {
        server.state.outcome = new SyncHttpError(400);
        await start();

        expect(engine.getStatus()).toBe('error');

        server.state.outcome = 'ok';
        await advance(1000);
        expect(engine.getStatus()).toBe('idle');
    });

    it('waits as long as Retry-After asks', async () => {
        server.state.outcome = new SyncHttpError(429, 30_000);
        await start();

        await advance(29_999);
        expect(server.state.requests).toBe(1);
        await advance(1);
        expect(server.state.requests).toBe(2);
        expect(engine.getStatus()).toBe('syncing');
    });

    it('reports network failures as offline and retries them', async () => {
        server.state.outcome = new TypeError('Failed to fetch');
        await start();

        expect(engine.getStatus()).toBe('offline');

        server.state.outcome = 'ok';
        await advance(1000);
        expect(engine.getStatus()).toBe('idle');
    });

    it('never pushes a change twice once it was accepted', async () => {
        await createTask({ text: 'A', date: '2026-10-12' });
        server.state.outcome = new SyncHttpError(500);
        await start();

        server.state.outcome = 'ok';
        await advance(1000);
        await advance(60 * 60_000);

        expect(server.state.pushes).toBe(2);
        expect(await db.outbox.count()).toBe(0);
    });
});

describe('timeouts', () => {
    it('aborts a request that gets no answer, reports offline and retries', async () => {
        createEngine({ requestTimeoutMs: 20_000 });
        server.state.outcome = 'hang';
        await start();

        expect(engine.getStatus()).toBe('syncing');

        await advance(20_000);
        expect(server.state.signals[0].aborted).toBe(true);
        expect(engine.getStatus()).toBe('offline');

        server.state.outcome = 'ok';
        await advance(1000);
        expect(server.state.requests).toBe(2);
        expect(engine.getStatus()).toBe('idle');
    });

    it('releases the cross-tab lock after a timeout', async () => {
        const locks = createFakeLocks();
        vi.stubGlobal('navigator', { locks });
        createEngine({ requestTimeoutMs: 20_000 });
        server.state.outcome = 'hang';
        await start();

        expect(locks.held).toBe(true);

        await advance(20_000);
        expect(locks.held).toBe(false);
    });

    it('cancels a hanging request on stop and releases the lock', async () => {
        const locks = createFakeLocks();
        vi.stubGlobal('navigator', { locks });
        server.state.outcome = 'hang';
        await start();

        const running = engine.sync();

        engine.stop();
        await running;
        await flush();

        expect(server.state.signals[0].aborted).toBe(true);
        expect(locks.held).toBe(false);
        expect(engine.getStatus()).toBe('idle');
    });

    it('tries again later when another tab keeps the lock', async () => {
        const locks = createFakeLocks();
        vi.stubGlobal('navigator', { locks });
        let release!: () => void;

        void locks.request('plain-week-sync', {}, () => {
            return new Promise<void>((resolve) => (release = resolve));
        });
        createEngine({ lockTimeoutMs: 5000 });
        await start();

        await advance(5000);
        expect(server.state.requests).toBe(0);
        expect(engine.getStatus()).toBe('syncing');

        release();
        await advance(1000);
        expect(server.state.requests).toBe(1);
        expect(engine.getStatus()).toBe('idle');
    });
});

describe('triggers', () => {
    it('retries at once when back online, on focus and when the page is shown', async () => {
        createEngine({ random: () => 1 });
        server.state.outcome = new SyncHttpError(500);
        await start();

        environment.emit('online');
        await flush();
        expect(server.state.requests).toBe(2);

        environment.emit('focus');
        await flush();
        expect(server.state.requests).toBe(3);

        environment.visible = false;
        environment.emit('visibilitychange');
        await flush();
        expect(server.state.requests).toBe(3);

        environment.visible = true;
        environment.emit('visibilitychange');
        await flush();
        expect(server.state.requests).toBe(4);

        server.state.outcome = 'ok';
        environment.emit('focus');
        await flush();
        expect(engine.getStatus()).toBe('idle');
    });

    it('shows offline when the browser goes offline and syncs when it is back', async () => {
        await start();
        environment.online = false;
        environment.emit('offline');
        await createTask({ text: 'A', date: '2026-10-12' });
        await advance(5000);

        expect(engine.getStatus()).toBe('offline');
        expect(server.state.pushes).toBe(0);

        environment.online = true;
        environment.emit('online');
        await flush();
        expect(server.state.pushes).toBe(1);
        expect(engine.getStatus()).toBe('idle');
    });

    it('pulls periodically only while the page is visible', async () => {
        createEngine({ intervalMs: 30_000 });
        await start();
        expect(server.state.requests).toBe(1);

        await advance(30_000);
        expect(server.state.requests).toBe(2);

        environment.visible = false;
        await advance(90_000);
        expect(server.state.requests).toBe(2);

        environment.visible = true;
        environment.emit('visibilitychange');
        await flush();
        expect(server.state.requests).toBe(3);
    });

    it('a manual retry runs at once and resets the backoff', async () => {
        server.state.outcome = new SyncHttpError(500);
        await start();
        await advance(1000);
        await advance(2000);
        await advance(4000);
        expect(server.state.requests).toBe(4);

        await engine.sync({ force: true });
        expect(server.state.requests).toBe(5);

        // Back to the first delay instead of 16 s.
        await advance(1000);
        expect(server.state.requests).toBe(6);
    });
});

describe('failures that are not retried', () => {
    it('stops on 402 and stays paused', async () => {
        const onPaymentRequired = vi.fn();

        createEngine({ onPaymentRequired });
        server.state.outcome = new SyncHttpError(402);
        await start();

        expect(onPaymentRequired).toHaveBeenCalledOnce();
        expect(engine.isStarted).toBe(false);

        environment.emit('online');
        environment.emit('focus');
        await advance(10 * 60_000);
        expect(server.state.requests).toBe(1);
    });

    it('forgets the user on 401 without retrying', async () => {
        const onSessionExpired = vi.fn();

        createEngine({ onSessionExpired });
        server.state.outcome = new SyncHttpError(401);
        await start();

        expect(onSessionExpired).toHaveBeenCalledOnce();

        await advance(10 * 60_000);
        expect(server.state.requests).toBe(1);
    });
});
