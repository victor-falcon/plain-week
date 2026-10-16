import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from 'vite-plus/test';
import { db, wipeLocalDatabase } from '@/lib/db/database';
import { seedDemoTasks } from '@/lib/db/demo-tasks';
import { createTask } from '@/lib/db/tasks';
import { createFakeSyncServer } from '@/test/fake-sync-server';
import { forgetEndedSession, logOut, syncEngine } from './index';

const SESSION_CHANNEL = 'plain-week-session';

let server: ReturnType<typeof createFakeSyncServer>;
let reload: ReturnType<typeof vi.fn>;
let confirm: ReturnType<typeof vi.fn>;

beforeEach(async () => {
    await wipeLocalDatabase();
    server = createFakeSyncServer();
    vi.stubGlobal('fetch', server.fetch);
    vi.stubGlobal('navigator', { onLine: true });
    reload = vi.fn();
    confirm = vi.fn(() => true);
    vi.stubGlobal('window', {
        confirm,
        addEventListener: () => {},
        removeEventListener: () => {},
        location: { reload },
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
        expect(await db.outbox.count()).toBe(0);
        expect(await db.meta.count()).toBe(0);
        expect(syncEngine.isStarted).toBe(false);
    });

    it('leaves the device like a first-time guest, so the demo comes back', async () => {
        await createTask({ text: 'A', date: '2026-10-12' });
        await db.meta.put({ key: 'demo_seeded', value: 1 });

        await logOut({
            userId: 1,
            logoutUrl: '/logout',
            confirmDiscard: () => true,
        });

        expect(await seedDemoTasks('2026-10-14')).toBe(true);

        const texts = (await db.tasks.toArray()).map((task) => task.text);

        expect(texts).not.toContain('A');
        expect(texts).toContain('Hover to complete me');
        expect(await db.outbox.count()).toBe(0);
    });

    it('tells the other tabs, which reload as guests', async () => {
        const otherTab = new BroadcastChannel(SESSION_CHANNEL);
        const received = new Promise((resolve) => {
            otherTab.addEventListener('message', resolve, { once: true });
        });

        await logOut({
            userId: 1,
            logoutUrl: '/logout',
            confirmDiscard: () => true,
        });

        await received;
        otherTab.close();
        // The logging-out tab navigates itself; it does not reload.
        expect(reload).not.toHaveBeenCalled();
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

describe('another tab ends the session', () => {
    it('stops syncing and reloads into the guest state', async () => {
        syncEngine.start(1);
        await syncEngine.sync();

        const otherTab = new BroadcastChannel(SESSION_CHANNEL);

        otherTab.postMessage('logged-out');
        otherTab.close();
        await vi.waitFor(() => expect(reload).toHaveBeenCalledOnce());
        expect(syncEngine.isStarted).toBe(false);
    });
});

describe('session expired during sync', () => {
    it('wipes local data and reloads into the guest state', async () => {
        syncEngine.start(1);
        await syncEngine.sync();
        await createTask({ text: 'private', date: '2026-10-12' });
        server.failWith = 401;

        await syncEngine.sync({ force: true });

        expect(await db.tasks.count()).toBe(0);
        expect(await db.outbox.count()).toBe(0);
        expect(reload).toHaveBeenCalledOnce();
    });
});

describe('forgetEndedSession', () => {
    it('keeps the work of a guest who never signed in, without asking the server', async () => {
        await createTask({ text: 'guest', date: '2026-10-12' });

        expect(await forgetEndedSession()).toBe(false);

        expect(await db.tasks.count()).toBe(1);
        expect(await db.outbox.count()).toBe(1);
        expect(server.requests).toHaveLength(0);
    });

    it("wipes a signed-out user's data once the server confirms there is no session", async () => {
        await db.meta.put({ key: 'user_id', value: '1' });
        await createTask({ text: 'private', date: '2026-10-12' });
        server.failWith = 401;

        expect(await forgetEndedSession()).toBe(true);

        expect(await db.tasks.count()).toBe(0);
        expect(await db.outbox.count()).toBe(0);
        expect(await db.meta.count()).toBe(0);
        expect(confirm).toHaveBeenCalledOnce();
        expect(reload).toHaveBeenCalledOnce();
    });

    it('keeps unsynced changes when the user declines to discard them', async () => {
        await db.meta.put({ key: 'user_id', value: '1' });
        await createTask({ text: 'offline work', date: '2026-10-12' });
        server.failWith = 401;
        confirm.mockReturnValue(false);

        expect(await forgetEndedSession()).toBe(false);

        expect(await db.tasks.count()).toBe(1);
        expect(await db.outbox.count()).toBe(1);
        expect(reload).not.toHaveBeenCalled();
    });

    it('checks once when called again while checking', async () => {
        await db.meta.put({ key: 'user_id', value: '1' });
        server.failWith = 401;

        const results = await Promise.all([
            forgetEndedSession(),
            forgetEndedSession(),
        ]);

        expect(results).toEqual([true, true]);
        expect(server.requests).toHaveLength(1);
        expect(reload).toHaveBeenCalledOnce();
    });

    it('keeps everything while offline or when the server still knows the user', async () => {
        await db.meta.put({ key: 'user_id', value: '1' });
        await createTask({ text: 'private', date: '2026-10-12' });

        vi.stubGlobal('fetch', () => Promise.reject(new TypeError('offline')));
        expect(await forgetEndedSession()).toBe(false);

        vi.stubGlobal('fetch', server.fetch);
        expect(await forgetEndedSession()).toBe(false);

        expect(await db.tasks.count()).toBe(1);
        expect(reload).not.toHaveBeenCalled();
    });
});
