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
import { createFakeSyncServer } from '@/test/fake-sync-server';
import { logOut, syncEngine } from './index';

let server: ReturnType<typeof createFakeSyncServer>;

beforeEach(async () => {
    await wipeLocalDatabase();
    server = createFakeSyncServer();
    vi.stubGlobal('fetch', server.fetch);
    vi.stubGlobal('navigator', { onLine: true });
    vi.stubGlobal('window', {
        addEventListener: () => {},
        removeEventListener: () => {},
    });
});

afterEach(() => {
    syncEngine.stop();
    vi.unstubAllGlobals();
});

describe('logOut', () => {
    it('pushes pending changes, logs out and wipes the local database', async () => {
        const task = await createTask({ text: 'A', date: '2026-10-12' });
        const confirmDiscard = vi.fn(() => true);

        const redirectTo = await logOut({
            userId: 1,
            logoutUrl: '/logout',
            confirmDiscard,
        });

        expect(server.rows.get(task.id)?.text).toBe('A');
        expect(server.requests.at(-1)?.url).toBe('/logout');
        expect(confirmDiscard).not.toHaveBeenCalled();
        expect(redirectTo).toBe('/');
        expect(await db.tasks.count()).toBe(0);
        // Only the onboarding flag survives: the guest left behind on this
        // device never gets the demo tasks.
        expect(await db.meta.toArray()).toEqual([
            { key: 'demo_seeded', value: 1 },
        ]);
        expect(syncEngine.isStarted).toBe(false);
    });

    it('keeps everything when the user does not want to lose unsynced changes', async () => {
        vi.stubGlobal('navigator', { onLine: false });
        await createTask({ text: 'A', date: '2026-10-12' });

        const redirectTo = await logOut({
            userId: 1,
            logoutUrl: '/logout',
            confirmDiscard: () => false,
        });

        expect(redirectTo).toBeNull();
        expect(server.requests).toHaveLength(0);
        expect(await db.tasks.count()).toBe(1);
        expect(await db.outbox.count()).toBe(1);
    });

    it('keeps local data when the server logout fails', async () => {
        await createTask({ text: 'A', date: '2026-10-12' });
        syncEngine.start(1);
        await syncEngine.sync();
        server.failWith = 500;

        await expect(
            logOut({
                userId: 1,
                logoutUrl: '/logout',
                confirmDiscard: () => true,
            }),
        ).rejects.toThrow();

        expect(await db.tasks.count()).toBe(1);
        expect(syncEngine.isStarted).toBe(true);
    });
});
