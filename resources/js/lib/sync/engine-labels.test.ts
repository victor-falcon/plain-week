import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from 'vite-plus/test';
import { db, wipeLocalDatabase } from '@/lib/db/database';
import { setLabelName } from '@/lib/db/labels';
import { createTask } from '@/lib/db/tasks';
import { createFakeSyncServer } from '@/test/fake-sync-server';
import { makeTask } from '@/test/fixtures';
import { SyncEngine } from './engine';
import type { SyncEnvironment } from './engine';
import { fetchTransport } from './transport';

const environment: SyncEnvironment = {
    isOnline: () => true,
    isVisible: () => true,
    addEventListener: () => {},
    removeEventListener: () => {},
};

let server: ReturnType<typeof createFakeSyncServer>;
let engine: SyncEngine;

async function startAndSync() {
    engine.start(1);
    await engine.sync();
}

function pushedBodies() {
    return server.requests
        .filter((r) => r.url.startsWith('/sync/push'))
        .map((r) => JSON.parse(r.init?.body as string));
}

beforeEach(async () => {
    await wipeLocalDatabase();
    server = createFakeSyncServer();
    vi.stubGlobal('fetch', server.fetch);
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

describe('label sync', () => {
    it('pushes guest label names with the tasks on the first sync', async () => {
        await setLabelName('pink', 'Deep work');
        const task = await createTask({ text: 'Write', date: '2026-10-12' });

        await startAndSync();

        expect(server.labels.get('pink')).toMatchObject({ name: 'Deep work' });
        expect(server.rows.has(task.id)).toBe(true);
        expect(await db.outbox.count()).toBe(0);
        expect(pushedBodies()[0]).toMatchObject({
            tasks: [expect.objectContaining({ id: task.id })],
            labels: [expect.objectContaining({ color: 'pink' })],
        });
    });

    it('sends tasks and labels as separate collections in one batch', async () => {
        await setLabelName('green', 'Health');
        await setLabelName('lilac', 'Home');

        await startAndSync();

        expect(pushedBodies()).toEqual([
            {
                tasks: [],
                labels: [
                    expect.objectContaining({ color: 'green', name: 'Health' }),
                    expect.objectContaining({ color: 'lilac', name: 'Home' }),
                ],
            },
        ]);
    });

    it('pulls label names from another device, mixed with tasks', async () => {
        const task = makeTask({ text: 'Remote' });

        server.seedLabel({
            color: 'mango',
            name: 'Errands',
            updated_at: '2026-10-12T10:00:00.000Z',
        });
        server.seed(task);
        server.seedLabel({
            color: 'grey',
            name: '',
            updated_at: '2026-10-12T10:00:00.000Z',
        });

        await startAndSync();

        expect(await db.labels.toArray()).toEqual([
            {
                color: 'grey',
                name: '',
                updated_at: '2026-10-12T10:00:00.000Z',
            },
            {
                color: 'mango',
                name: 'Errands',
                updated_at: '2026-10-12T10:00:00.000Z',
            },
        ]);
        expect(await db.tasks.get(task.id)).toBeDefined();
        expect((await db.meta.get('cursor'))?.value).toBe(3);
    });

    it('applies remote labels with last-write-wins', async () => {
        await db.labels.bulkPut([
            {
                color: 'pink',
                name: 'Old',
                updated_at: '2026-10-12T10:00:00.000Z',
            },
            {
                color: 'black',
                name: 'Newer here',
                updated_at: '2026-10-12T12:00:00.000Z',
            },
        ]);
        server.seedLabel({
            color: 'pink',
            name: 'New',
            updated_at: '2026-10-12T11:00:00.000Z',
        });
        server.seedLabel({
            color: 'black',
            name: 'Older there',
            updated_at: '2026-10-12T11:00:00.000Z',
        });

        await startAndSync();

        expect((await db.labels.get('pink'))?.name).toBe('New');
        expect((await db.labels.get('black'))?.name).toBe('Newer here');
    });

    it('does not overwrite a pending local rename that is as new', async () => {
        const label = {
            color: 'yellow' as const,
            name: 'Mine',
            updated_at: '2026-10-12T10:00:00.000Z',
        };

        await db.labels.put(label);
        await db.outbox.put({
            task_id: 'yellow',
            entity: 'label',
            revision: 1,
        });
        server.seedLabel({ ...label, name: 'Theirs' });

        await startAndSync();

        expect((await db.labels.get('yellow'))?.name).toBe('Mine');
        expect(server.labels.get('yellow')?.name).toBe('Mine');
    });

    it('converges on a newer remote rename over an older pending one', async () => {
        await setLabelName('yellow', 'Mine');
        server.seedLabel({
            color: 'yellow',
            name: 'Theirs',
            updated_at: '2999-01-01T00:00:00.000Z',
        });

        await startAndSync();

        expect((await db.labels.get('yellow'))?.name).toBe('Theirs');
        expect(server.labels.get('yellow')?.name).toBe('Theirs');
        expect(await db.outbox.count()).toBe(0);
    });

    it('ignores labels of a colour it does not know', async () => {
        server.seedLabel({
            color: 'teal' as 'pink',
            name: 'Future',
            updated_at: '2026-10-12T10:00:00.000Z',
        });

        await startAndSync();

        expect(await db.labels.count()).toBe(0);
    });

    it('wipes label names with the rest of the local data', async () => {
        await setLabelName('pink', 'Deep work');

        await wipeLocalDatabase();

        expect(await db.labels.count()).toBe(0);
        expect(await db.outbox.count()).toBe(0);
    });

    it('pulls everything again once after an update from format 2', async () => {
        server.seedLabel({
            color: 'pink',
            name: 'Deep work',
            updated_at: '2026-10-12T10:00:00.000Z',
        });
        server.seed(makeTask());
        // A format 2 cursor passed over the label.
        await db.meta.bulkPut([
            { key: 'cursor', value: 2 },
            { key: 'cursor_format', value: 2 },
        ]);

        await startAndSync();

        expect(
            server.requests.find((r) => r.url.startsWith('/sync/pull'))?.url,
        ).toContain('cursor=0');
        expect((await db.labels.get('pink'))?.name).toBe('Deep work');
    });
});
