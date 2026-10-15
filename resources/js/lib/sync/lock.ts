const LOCK_NAME = 'plain-week-sync';

/**
 * Runs `task` holding a cross-tab Web Lock, so sync runs in different tabs and
 * the logout wipe never interleave. Falls back to running it directly where
 * the Web Locks API is missing (tests, old browsers).
 */
export async function withSyncLock<T>(task: () => Promise<T>): Promise<T> {
    if (typeof navigator === 'undefined' || !navigator.locks) {
        return task();
    }

    let result!: T;

    await navigator.locks.request(LOCK_NAME, async () => {
        result = await task();
    });

    return result;
}
