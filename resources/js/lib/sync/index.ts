import { db, wipeLocalDatabase } from '@/lib/db/database';
import { SyncEngine, claimDatabaseFor } from './engine';
import { withSyncLock } from './lock';
import { fetchTransport, isSessionGone, requestLogout } from './transport';

export type { SyncStatus } from './engine';

/** The app-wide sync engine. Started by `SyncProvider`. */
export const syncEngine = new SyncEngine({
    db,
    transport: fetchTransport,
    onSessionExpired: leaveEndedSession,
    confirmDiscard: confirmEndedSessionDiscard,
});

/**
 * Gets the local database ready for the signed-in user outside the planner
 * (Settings › Data): claims it like a sync run does (another user's leftover
 * data is wiped, guest work kept), so a later run never wipes what is written
 * now, then runs one sync (needs a started engine, see `SyncProvider`).
 * Resolves with true when the local data is up to date with the server, false
 * when that sync could not finish (offline, errors).
 */
export async function prepareLocalData(
    userId: string | number,
): Promise<boolean> {
    await withSyncLock(() => claimDatabaseFor(db, String(userId)));
    await syncEngine.sync({ force: true });

    return syncEngine.isStarted && syncEngine.getStatus() === 'idle';
}

const SESSION_CHANNEL = 'plain-week-session';

/**
 * Tells the other tabs that this device signed out and the shared database
 * was wiped. A message is never delivered to the channel that posts it, so
 * the tab that logs out does not react to its own message.
 */
const sessionChannel =
    typeof BroadcastChannel === 'undefined'
        ? null
        : new BroadcastChannel(SESSION_CHANNEL);

// Another tab signed out: stop syncing here, so this tab never repopulates
// the database, and reload into the guest state (fresh page props, no
// in-memory leftovers of the old user, the demo tasks seeded again).
sessionChannel?.addEventListener('message', () => {
    syncEngine.stop();
    window.location.reload();
});

/**
 * The session ended without a logout, but some changes never reached the
 * server: they are only discarded if the user agrees. Keeping them keeps them
 * on this device until the same user signs in again.
 */
function confirmEndedSessionDiscard(pendingChanges: number): boolean {
    const changes =
        pendingChanges === 1
            ? '1 change has not been synced. Discard it'
            : `${pendingChanges} changes have not been synced. Discard them`;

    return window.confirm(
        `Your session has ended and ${changes} and clear this device? Cancel to keep everything and log in again.`,
    );
}

/** The local database was wiped after the session ended outside a logout. */
function leaveEndedSession(): void {
    sessionChannel?.postMessage('logged-out');
    window.location.reload();
}

let forgetting: Promise<boolean> | null = null;

/**
 * For guest pages. When the local database still belongs to a user, that
 * session ended without a logout on this device (expired, logged out on the
 * server). Once the server confirms there is no session, the data is wiped
 * like on logout and the page reloads as a first-time guest. Offline, or when
 * the server still knows the user (a stale offline shell), nothing changes.
 * Unsynced changes are only discarded if the user agrees. A guest's own data
 * has no owner and is never touched.
 * Resolves with true when it wiped.
 */
export function forgetEndedSession(): Promise<boolean> {
    forgetting ??= withSyncLock(async () => {
        // Under the lock: a sign-in in another tab cannot claim the database
        // between this check and the wipe.
        if ((await db.meta.get('user_id')) === undefined) {
            return false;
        }

        if (!(await isSessionGone(fetchTransport))) {
            return false;
        }

        const pending = await db.outbox.count();

        if (pending > 0 && !confirmEndedSessionDiscard(pending)) {
            return false;
        }

        await wipeLocalDatabase(db);

        return true;
    })
        .then((wiped) => {
            if (wiped) {
                leaveEndedSession();
            }

            return wiped;
        })
        .finally(() => {
            forgetting = null;
        });

    return forgetting;
}

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
 * 4. only then wipes the local database (privacy on shared devices), so the
 *    device is left like a first-time guest's (the demo tasks come back), and
 *    tells other tabs to reload as guests.
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

    await withSyncLock(() => wipeLocalDatabase(db));
    sessionChannel?.postMessage('logged-out');

    return redirectTo;
}
