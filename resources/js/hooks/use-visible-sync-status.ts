import { useEffect, useState } from 'react';
import { useSyncStatus } from '@/hooks/use-sync-status';
import type { SyncStatus } from '@/lib/sync';

/** Sync runs are frequent and short; only show ones that take a while. */
const SYNCING_INDICATOR_DELAY_MS = 600;

/**
 * The sync status to show in the UI: like `useSyncStatus`, but a run only
 * reads as 'syncing' once it has lasted a moment, so the indicator does not
 * flicker on every short run.
 */
export function useVisibleSyncStatus(): SyncStatus {
    const status = useSyncStatus();
    const [slowSync, setSlowSync] = useState(false);

    useEffect(() => {
        if (status !== 'syncing') {
            return;
        }

        const timer = window.setTimeout(
            () => setSlowSync(true),
            SYNCING_INDICATOR_DELAY_MS,
        );

        return () => {
            window.clearTimeout(timer);
            setSlowSync(false);
        };
    }, [status]);

    return status === 'syncing' && !slowSync ? 'idle' : status;
}
