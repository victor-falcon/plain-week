const LOCK_NAME = 'plain-week-sync';

/** The lock was not granted in time: another tab held it too long. */
export class SyncLockTimeout extends Error {
    constructor() {
        super('Timed out waiting for the sync lock.');
        this.name = 'SyncLockTimeout';
    }
}

/**
 * Runs `task` holding a cross-tab Web Lock, so sync runs in different tabs and
 * the logout wipe never interleave. The lock is released as soon as `task`
 * settles, whether it resolves or throws. With `timeoutMs`, gives up waiting
 * for the lock after that long (`SyncLockTimeout`); once granted, the task is
 * never cut short. Falls back to running it directly where the Web Locks API
 * is missing (tests, old browsers).
 */
export async function withSyncLock<T>(
    task: () => Promise<T>,
    { timeoutMs }: { timeoutMs?: number } = {},
): Promise<T> {
    if (typeof navigator === 'undefined' || !navigator.locks) {
        return task();
    }

    const waiting = timeoutMs === undefined ? null : new AbortController();
    const timer =
        waiting === null ? null : setTimeout(() => waiting.abort(), timeoutMs);
    let result!: T;

    try {
        await navigator.locks.request(
            LOCK_NAME,
            waiting === null ? {} : { signal: waiting.signal },
            async () => {
                if (timer !== null) {
                    clearTimeout(timer);
                }

                result = await task();
            },
        );
    } catch (error) {
        if (waiting?.signal.aborted) {
            throw new SyncLockTimeout();
        }

        throw error;
    } finally {
        if (timer !== null) {
            clearTimeout(timer);
        }
    }

    return result;
}
