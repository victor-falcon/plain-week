import { db, wipeLocalDatabase } from '@/lib/db/database';
import { SyncEngine } from './engine';
import { withSyncLock } from './lock';
import { fetchTransport, requestLogout } from './transport';

export type { SyncStatus } from './engine';

/** The app-wide sync engine. Started by `SyncProvider`. */
export const syncEngine = new SyncEngine({ db, transport: fetchTransport });

const LOGOUT_CHANNEL = 'plain-week-session';

function logoutChannel(): BroadcastChannel | null {
    return typeof BroadcastChannel === 'undefined'
        ? null
        : new BroadcastChannel(LOGOUT_CHANNEL);
}

// Another tab logged out and wiped the shared database: stop syncing here
// too, so this tab never repopulates it.
logoutChannel()?.addEventListener('message', () => syncEngine.stop());

export type LogOutOptions = {
    userId: string | number;
    logoutUrl: string;
    /**
     * Asked when some local changes could not reach the server (offline,
     * errors). Return true to log out anyway and discard them.
     */
    confirmDiscard: (pendingChanges: number) => boolean;
};

/**
 * Logs out without silently losing data:
 * 1. pushes pending changes,
 * 2. asks before discarding any that could not be pushed,
 * 3. ends the server session,
 * 4. only then wipes the local database (privacy on shared devices) and tells
 *    other tabs to stop syncing. Only the `demo_seeded` flag is kept.
 * Resolves with the URL to visit next, or null if the user cancelled.
 * Rejects if the server session could not be ended; local data is kept.
 */
export async function logOut({
    userId,
    logoutUrl,
    confirmDiscard,
}: LogOutOptions): Promise<string | null> {
    const wasStarted = syncEngine.isStarted;

    syncEngine.start(userId);
    await syncEngine.sync({ force: true });

    const pending = await syncEngine.pendingCount();

    if (pending > 0 && !confirmDiscard(pending)) {
        if (!wasStarted) {
            syncEngine.stop();
        }

        return null;
    }

    syncEngine.stop();

    let redirectTo: string;

    try {
        redirectTo = await requestLogout(logoutUrl);
    } catch (error) {
        if (wasStarted) {
            syncEngine.start(userId);
        }

        throw error;
    }

    await withSyncLock(() => wipeLocalDatabase(db, { onboarded: true }));

    const channel = logoutChannel();

    channel?.postMessage('logged-out');
    channel?.close();

    return redirectTo;
}
