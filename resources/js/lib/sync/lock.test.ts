import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { createFakeLocks } from '@/test/fake-locks';
import { SyncLockTimeout, withSyncLock } from './lock';

afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

describe('withSyncLock', () => {
    it('runs the task directly without the Web Locks API', async () => {
        vi.stubGlobal('navigator', {});

        await expect(withSyncLock(async () => 'done')).resolves.toBe('done');
    });

    it('releases the lock when the task throws', async () => {
        const locks = createFakeLocks();
        vi.stubGlobal('navigator', { locks });

        await expect(
            withSyncLock(() => Promise.reject(new Error('boom'))),
        ).rejects.toThrow('boom');
        expect(locks.held).toBe(false);
        await expect(withSyncLock(async () => 'next')).resolves.toBe('next');
    });

    it('gives up waiting for a lock another holder keeps', async () => {
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
        const locks = createFakeLocks();
        vi.stubGlobal('navigator', { locks });
        let release!: () => void;
        const holder = withSyncLock(
            () => new Promise<void>((resolve) => (release = resolve)),
        );
        const task = vi.fn(async () => {});
        const waiting = withSyncLock(task, { timeoutMs: 1000 });
        const outcome = expect(waiting).rejects.toBeInstanceOf(SyncLockTimeout);

        await vi.advanceTimersByTimeAsync(1000);
        await outcome;

        // The abandoned request never runs, even once the lock is free.
        release();
        await holder;
        expect(task).not.toHaveBeenCalled();
        expect(locks.held).toBe(false);
    });

    it('never cuts a granted task short', async () => {
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
        vi.stubGlobal('navigator', { locks: createFakeLocks() });
        let finish!: (value: string) => void;
        const running = withSyncLock(
            () => new Promise<string>((resolve) => (finish = resolve)),
            { timeoutMs: 1000 },
        );

        await vi.advanceTimersByTimeAsync(5000);
        finish('done');

        await expect(running).resolves.toBe('done');
    });
});
