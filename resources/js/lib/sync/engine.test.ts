import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from 'vite-plus/test';
import { db, wipeLocalDatabase } from '@/lib/db/database';
import { demoIds } from '@/lib/db/demo';
import { seedDemoTasks } from '@/lib/db/demo-tasks';
import { queryWeekTasks } from '@/lib/db/queries';
import {
    createTask,
    setRecurrence,
    toggleDone,
    updateTask,
} from '@/lib/db/tasks';
import type { Task } from '@/lib/db/types';
import { occurrenceId } from '@/lib/recurrence/expand';
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

describe('invalid records', () => {
    it('quarantines a record the server refuses and pushes the rest', async () => {
        server.isInvalid = (task) => task.text === 'invalid';

        const good = await createTask({ text: 'good', date: '2026-10-12' });
        const bad = await createTask({ text: 'invalid', date: '2026-10-12' });
        const other = await createTask({ text: 'other', date: '2026-10-12' });

        await startAndSync();

        expect([...server.rows.keys()].sort()).toEqual(
            [good.id, other.id].sort(),
        );
        expect(await db.outbox.get(bad.id)).toEqual({
            task_id: bad.id,
            revision: 1,
            failed_revision: 1,
        });
        expect(engine.getStatus()).toBe('error');

        // Fixing the record releases it from quarantine.
        await updateTask(bad.id, { text: 'fixed' });
        await engine.sync({ force: true });

        expect(server.rows.get(bad.id)?.text).toBe('fixed');
        expect(await db.outbox.count()).toBe(0);
        expect(engine.getStatus()).toBe('idle');
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

    it('says which sync format it understands', async () => {
        await createTask({ text: 'A', date: '2026-10-12' });
        await startAndSync();

        expect(
            new Set(server.requests.map((r) => r.url.split('?')[0])),
        ).toEqual(new Set(['/sync/push', '/sync/pull']));
        server.requests.forEach(({ init }) =>
            expect(new Headers(init?.headers).get('X-Sync-Format')).toBe('2'),
        );
    });

    it('pulls everything again once after an update from an older format', async () => {
        const daily = makeTask({
            text: 'Water plants',
            recurrence: { type: 'daily', every: 21 },
        });

        server.seed(daily);
        server.seed(makeTask({ text: 'B' }));
        // A v0.0.3 cursor: the server held the daily series back from it.
        await db.meta.put({ key: 'cursor', value: 2 });

        await startAndSync();

        expect(
            server.requests.find((r) => r.url.startsWith('/sync/pull'))?.url,
        ).toContain('cursor=0');
        expect((await db.tasks.get(daily.id))?.recurrence).toEqual({
            type: 'daily',
            every: 21,
        });
        expect((await db.meta.get('cursor_format'))?.value).toBe(2);

        await engine.sync();

        expect(server.requests.at(-1)?.url).toContain('cursor=2');
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

describe('recurring tasks', () => {
    const MON_WED: Task['recurrence'] = { type: 'weekly', weekdays: [1, 3] };

    async function mondayToSunday() {
        const week = await queryWeekTasks('2026-10-12');

        return Object.entries(week).flatMap(([day, items]) =>
            items.map((item) => `${item.text}${item.done ? '✓' : ''}@${day}`),
        );
    }

    it('round-trips series and exceptions to another device', async () => {
        const task = await createTask({ text: 'Gym', date: '2026-10-12' });

        await setRecurrence(task.id, MON_WED);

        const exception = await toggleDone(occurrenceId(task.id, '2026-10-14'));

        await startAndSync();

        expect(server.rows.get(task.id)).toMatchObject({
            recurrence: MON_WED,
            series_id: null,
            occurrence_date: null,
        });
        expect(server.rows.get(exception.id)).toMatchObject({
            recurrence: null,
            series_id: task.id,
            occurrence_date: '2026-10-14',
        });

        // Another device: an empty database pulls everything.
        engine.stop();
        await wipeLocalDatabase();
        await startAndSync();

        expect(await db.tasks.get(task.id)).toMatchObject({
            recurrence: MON_WED,
        });
        expect(await mondayToSunday()).toEqual([
            'Gym@2026-10-12',
            'Gym✓@2026-10-14',
        ]);
    });

    it('always pushes the three recurrence keys', async () => {
        await createTask({ text: 'Plain', date: '2026-10-12' });
        await startAndSync();

        const push = server.requests.find((r) => r.url === '/sync/push');
        const [sent] = JSON.parse(push?.init?.body as string).tasks;

        expect(sent).toMatchObject({
            recurrence: null,
            series_id: null,
            occurrence_date: null,
        });
    });

    it('shows one of two exceptions for the same occurrence', async () => {
        const task = await createTask({ text: 'Gym', date: '2026-10-12' });

        await setRecurrence(task.id, MON_WED);

        const mine = await toggleDone(occurrenceId(task.id, '2026-10-14'));

        // Another device changed the same occurrence offline, later.
        server.seed({
            ...(await db.tasks.get(mine.id))!,
            id: 'ffffffff-0000-7000-8000-000000000000',
            text: 'Theirs',
            done: false,
            updated_at: '2099-01-01T00:00:00.000Z',
        });
        await startAndSync();

        expect(await mondayToSunday()).toEqual([
            'Gym@2026-10-12',
            'Theirs@2026-10-14',
        ]);
    });

    it('applies a newer remote series with last-write-wins', async () => {
        const series = makeTask({ text: 'Gym', recurrence: MON_WED });

        await db.tasks.put(series);
        server.seed({
            ...series,
            recurrence: { ...MON_WED, until: '2026-10-13' },
            updated_at: '2026-10-12T12:00:00.000Z',
        });
        server.seed(
            makeTask({
                text: 'Gym (moved)',
                date: '2026-10-15',
                series_id: series.id,
                occurrence_date: '2026-10-12',
            }),
        );
        await startAndSync();

        expect(await mondayToSunday()).toEqual(['Gym (moved)@2026-10-15']);
    });

    it('treats remote records without the recurrence fields as plain', async () => {
        const legacy: Partial<Task> = makeTask({ text: 'Old' });

        delete legacy.recurrence;
        delete legacy.series_id;
        delete legacy.occurrence_date;
        server.seed(legacy as Task);
        await startAndSync();

        expect(await db.tasks.get(legacy.id as string)).toMatchObject({
            recurrence: null,
            series_id: null,
            occurrence_date: null,
        });
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

    it('wipes the local database and stops when the session is gone (401)', async () => {
        const onSessionExpired = vi.fn();

        engine = new SyncEngine({
            db,
            transport: fetchTransport,
            environment,
            onSessionExpired,
        });
        await startAndSync();
        await createTask({ text: 'private', date: '2026-10-12' });
        server.failWith = 401;

        await engine.sync({ force: true });

        expect(await db.tasks.count()).toBe(0);
        expect(await db.outbox.count()).toBe(0);
        expect(await db.meta.count()).toBe(0);
        expect(engine.isStarted).toBe(false);
        expect(onSessionExpired).toHaveBeenCalledOnce();

        const count = server.requests.length;

        environment.emit('focus');
        await engine.sync();
        expect(server.requests.length).toBe(count);
    });

    it('stops without retrying and keeps local data when a plan is required (402)', async () => {
        const onPaymentRequired = vi.fn();
        const onSessionExpired = vi.fn();

        engine = new SyncEngine({
            db,
            transport: fetchTransport,
            environment,
            onPaymentRequired,
            onSessionExpired,
        });
        const task = await createTask({ text: 'unpaid', date: '2026-10-12' });
        server.failWith = 402;

        await startAndSync();

        expect(onPaymentRequired).toHaveBeenCalledOnce();
        expect(onSessionExpired).not.toHaveBeenCalled();
        expect(engine.isStarted).toBe(false);
        expect(engine.getStatus()).toBe('idle');
        expect(await db.tasks.get(task.id)).toBeDefined();
        expect(await db.outbox.count()).toBe(1);

        // No retry loop: triggers and timers do nothing once stopped.
        const count = server.requests.length;

        environment.emit('focus');
        environment.emit('online');
        await engine.sync({ force: true });
        expect(server.requests.length).toBe(count);

        // After paying, the next start pushes what was kept.
        server.failWith = null;
        await startAndSync();
        expect(server.rows.get(task.id)?.text).toBe('unpaid');
    });

    it('keeps unsynced changes when the user declines to discard them', async () => {
        const onSessionExpired = vi.fn();
        const confirmDiscard = vi.fn(() => false);

        engine = new SyncEngine({
            db,
            transport: fetchTransport,
            environment,
            onSessionExpired,
            confirmDiscard,
        });
        await createTask({ text: 'offline work', date: '2026-10-12' });
        server.failWith = 401;

        await startAndSync();

        expect(confirmDiscard).toHaveBeenCalledWith(1);
        expect(await db.tasks.count()).toBe(1);
        expect(await db.outbox.count()).toBe(1);
        expect(engine.isStarted).toBe(false);
        expect(onSessionExpired).not.toHaveBeenCalled();
    });

    it('treats a 419 on push as a lost session once a pull confirms it', async () => {
        const onSessionExpired = vi.fn();

        engine = new SyncEngine({
            db,
            transport: fetchTransport,
            environment,
            onSessionExpired,
        });
        await createTask({ text: 'private', date: '2026-10-12' });
        server.failPushWith = 419;
        server.failWith = null;

        // The pull answers normally: the session is alive, keep everything.
        await startAndSync();
        expect(await db.tasks.count()).toBe(1);
        expect(await db.outbox.count()).toBe(1);
        expect(engine.getStatus()).toBe('error');
        expect(onSessionExpired).not.toHaveBeenCalled();

        // The pull answers 401: the session is gone.
        server.failWith = 401;
        await engine.sync({ force: true });

        expect(await db.tasks.count()).toBe(0);
        expect(await db.outbox.count()).toBe(0);
        expect(onSessionExpired).toHaveBeenCalledOnce();
    });

    it('reports errors, backs off and recovers', async () => {
        server.failWith = 500;
        await startAndSync();
        expect(engine.getStatus()).toBe('error');

        server.failWith = null;
        const count = server.requests.length;

        await engine.sync();
        expect(server.requests.length).toBe(count);
        expect(engine.getStatus()).toBe('error');

        await engine.sync({ force: true });
        expect(engine.getStatus()).toBe('idle');
    });

    it('reports network failures as offline', async () => {
        vi.stubGlobal('fetch', () => Promise.reject(new TypeError('failed')));
        await startAndSync();

        expect(engine.getStatus()).toBe('offline');
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

describe('demo tasks', () => {
    it('never pushes them, deletes the untouched ones and keeps the edited', async () => {
        await seedDemoTasks('2026-10-14');
        const [edited, untouched] = (await db.tasks.toArray()).filter(
            (task) => task.recurrence === null,
        );
        const own = await createTask({ text: 'Mine', date: '2026-10-12' });

        await updateTask(edited.id, { text: 'Edited demo' });
        await startAndSync();

        expect([...server.rows.keys()].sort()).toEqual(
            [edited.id, own.id].sort(),
        );
        expect(await db.tasks.get(untouched.id)).toBeUndefined();
        expect(await db.tasks.count()).toBe(2);
        expect(await demoIds()).toEqual(new Set());
        expect(await db.outbox.count()).toBe(0);
    });
});
