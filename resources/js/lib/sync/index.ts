import { db, wipeLocalDatabase } from '@/lib/db/database';
import { SyncEngine } from './engine';
import { fetchTransport } from './transport';

export type { SyncStatus } from './engine';

/** The app-wide sync engine. Started by `SyncProvider`. */
export const syncEngine = new SyncEngine({ db, transport: fetchTransport });

const LOGOUT_FLUSH_TIMEOUT_MS = 3000;

/**
 * Called on logout: gives pending changes a short chance to reach the server,
 * then stops syncing and wipes the local database (privacy on shared devices).
 */
export async function clearLocalSession(): Promise<void> {
    await Promise.race([
        syncEngine.sync(),
        new Promise((resolve) => setTimeout(resolve, LOGOUT_FLUSH_TIMEOUT_MS)),
    ]);
    syncEngine.stop();
    await wipeLocalDatabase();
}
