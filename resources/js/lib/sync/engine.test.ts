import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from 'vite-plus/test';
import { db, wipeLocalDatabase } from '@/lib/db/database';
import { createTask, updateTask } from '@/lib/db/tasks';
import { createFakeSyncServer } from '@/test/fake-sync-server';
import { makeTask } from '@/test/fixtures';
import { SyncEngine } from './engine';
import type { SyncEnvironment } from './engine';
import { fetchTransport } from './transport';

function createEnvironment() {
    const listeners = new Map<string, Set<() => void>>();
    const environment: SyncEnvironment & {
        online: boolean;
        emit(type: string): void;
    } = {
        online: true,
        isOnline: () => environment.online,
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

let server: ReturnType<typeof createFakeSyncServer>;
let environment: ReturnType<typeof createEnvironment>;
let engine: SyncEngine;

async function startAndSync(userId: number = 1) {
    engine.start(userId);
    await engine.sync();
}

beforeEach(async () => {
    await wipeLocalDatabase();
    server = createFakeSyncServer();
    vi.stubGlobal('fetch', server.fetch);
    environment = createEnvironment();
    engine = new SyncEngine({
        db,
        transport: fetchTransport,
        environment,
        pushBatchSize: 2,
        pullLimit: 2,
    });
});

afterEach(() => {
    engine.stop();
    vi.unstubAllGlobals();
});

describe('push', () => {
    it('pushes the outbox in batches and clears it', async () => {
        const tasks = await Promise.all(
            ['A', 'B', 'C'].map((text) =>
                createTask({ text, date: '2026-10-12' }),
            ),
        );

        await startAndSync();

        const pushes = server.requests.filter((r) => r.url === '/sync/push');

        expect(pushes).toHaveLength(2);
        expect(server.rows.size).toBe(3);
        expect(server.rows.get(tasks[0].id)?.text).toBe('A');
        expect(await db.outbox.count()).toBe(0);
        expect(engine.getStatus()).toBe('idle');
    });

    it('keeps the outbox entry when the record changed mid-push', async () => {
        const task = await createTask({ text: 'before', date: '2026-10-12' });

        server.beforePushResponse = async () => {
            server.beforePushResponse = null;
            await updateTask(task.id, { text: 'after' });
        };
        await startAndSync();

        expect(server.rows.get(task.id)?.text).toBe('after');
        expect(await db.outbox.count()).toBe(0);

        // The edit made during the first push was sent by a second run.
        const pushes = server.requests.filter((r) => r.url === '/sync/push');

        expect(pushes).toHaveLength(2);
    });

    it('does not clear an entry that changed while its push was in flight', async () => {
        const task = await createTask({ text: 'before', date: '2026-10-12' });

        server.beforePushResponse = async () => {
            await updateTask(task.id, { text: 'after' });
            engine.stop();
        };
        engine.start(1);
        await engine.sync();

        expect(await db.outbox.get(task.id)).toEqual({
            task_id: task.id,
            revision: 2,
        });
        expect((await db.tasks.get(task.id))?.text).toBe('after');
    });

    it('sends the session credentials and the XSRF token', async () => {
        vi.stubGlobal('document', { cookie: 'a=1; XSRF-TOKEN=abc%3D%3D' });
        await createTask({ text: 'A', date: '2026-10-12' });
        await startAndSync();

        const push = server.requests.find((r) => r.url === '/sync/push');
        const headers = new Headers(push?.init?.headers);

        expect(push?.init?.method).toBe('POST');
        expect(push?.init?.credentials).toBe('same-origin');
        expect(headers.get('X-XSRF-TOKEN')).toBe('abc==');
        expect(headers.get('Accept')).toBe('application/json');
    });
});

describe('pull', () => {
    it('pulls every page and stores the cursor', async () => {
        ['A', 'B', 'C'].forEach((text) => server.seed(makeTask({ text })));

        await startAndSync();

        expect(await db.tasks.count()).toBe(3);
        expect((await db.meta.get('cursor'))?.value).toBe(3);

        server.seed(makeTask({ text: 'D' }));
        await engine.sync();

        expect(await db.tasks.count()).toBe(4);
        expect(server.requests.at(-1)?.url).toContain('cursor=3');
    });

    it('applies remote records with last-write-wins', async () => {
        const local = makeTask({
            text: 'local',
            updated_at: '2026-10-12T12:00:00.000Z',
        });
        const newerLocal = makeTask({
            text: 'local',
            updated_at: '2026-10-12T12:00:00.000Z',
        });

        await db.tasks.bulkPut([local, newerLocal]);
        server.seed({
            ...local,
            text: 'remote newer',
            updated_at: '2026-10-12T13:00:00.000Z',
        });
        server.seed({
            ...newerLocal,
            text: 'remote older',
            updated_at: '2026-10-12T11:00:00.000Z',
        });
        server.seed(
            makeTask({
                text: 'remote only',
                deleted_at: '2026-10-12T11:00:00.000Z',
            }),
        );

        await startAndSync();

        expect((await db.tasks.get(local.id))?.text).toBe('remote newer');
        expect((await db.tasks.get(newerLocal.id))?.text).toBe('local');
        expect(await db.tasks.count()).toBe(3);
    });

    it('does not overwrite a pending local change that is as new', async () => {
        const task = makeTask({ text: 'pending' });

        await db.tasks.put(task);
        await db.outbox.put({ task_id: task.id, revision: 1 });
        server.seed({ ...task, text: 'remote' });
        await startAndSync();

        expect((await db.tasks.get(task.id))?.text).toBe('pending');
        expect(server.rows.get(task.id)?.text).toBe('pending');
    });
});

describe('pull with pending changes', () => {
    it('drops a pending local change that is older than the remote one', async () => {
        const task = makeTask({
            text: 'old local',
            updated_at: '2026-10-12T10:00:00.000Z',
        });

        await db.tasks.put(task);
        await db.outbox.put({ task_id: task.id, revision: 1 });
        server.seed({
            ...task,
            text: 'remote',
            updated_at: '2026-10-12T12:00:00.000Z',
        });

        await startAndSync();

        expect((await db.tasks.get(task.id))?.text).toBe('remote');
        expect(await db.outbox.count()).toBe(0);
        expect(server.rows.get(task.id)?.text).toBe('remote');
    });
});

describe('lifecycle', () => {
    it('wipes the local database when a different user logs in', async () => {
        await db.meta.put({ key: 'user_id', value: '1' });
        await db.meta.put({ key: 'cursor', value: 42 });
        await createTask({ text: 'from user 1', date: '2026-10-12' });

        await startAndSync(2);

        expect(await db.tasks.count()).toBe(0);
        expect(server.rows.size).toBe(0);
        expect((await db.meta.get('user_id'))?.value).toBe('2');
        expect((await db.meta.get('cursor'))?.value).toBe(0);
    });

    it('keeps and pushes guest data on the first authenticated sync', async () => {
        const task = await createTask({ text: 'guest', date: '2026-10-12' });

        await startAndSync(1);

        expect(server.rows.get(task.id)?.text).toBe('guest');
        expect(await db.tasks.get(task.id)).toBeDefined();
        expect((await db.meta.get('user_id'))?.value).toBe('1');
    });

    it('stops quietly on 401', async () => {
        server.failWith = 401;
        await startAndSync();

        expect(engine.getStatus()).toBe('idle');

        const count = server.requests.length;

        environment.emit('focus');
        await engine.sync();
        expect(server.requests.length).toBe(count);
    });

    it('reports errors and recovers on the next run', async () => {
        server.failWith = 500;
        await startAndSync();
        expect(engine.getStatus()).toBe('error');

        server.failWith = null;
        await engine.sync();
        expect(engine.getStatus()).toBe('idle');
    });

    it('does not sync offline and syncs when back online', async () => {
        environment.online = false;
        await createTask({ text: 'A', date: '2026-10-12' });
        await startAndSync();

        expect(engine.getStatus()).toBe('offline');
        expect(server.requests).toHaveLength(0);

        environment.online = true;
        environment.emit('online');
        await engine.sync();

        expect(server.rows.size).toBe(1);
        expect(engine.getStatus()).toBe('idle');
    });

    it('syncs after local mutations, debounced', async () => {
        engine = new SyncEngine({
            db,
            transport: fetchTransport,
            environment,
            debounceMs: 50,
        });
        await startAndSync();

        await createTask({ text: 'A', date: '2026-10-12' });
        await createTask({ text: 'B', date: '2026-10-12' });
        expect(server.rows.size).toBe(0);

        await vi.waitFor(() => expect(server.rows.size).toBe(2));
        expect(
            server.requests.filter((r) => r.url === '/sync/push'),
        ).toHaveLength(1);
    });

    it('notifies status subscribers', async () => {
        const seen: string[] = [];
        const unsubscribe = engine.subscribe(() =>
            seen.push(engine.getStatus()),
        );

        await startAndSync();
        unsubscribe();

        expect(seen).toContain('syncing');
        expect(seen.at(-1)).toBe('idle');
    });
});
