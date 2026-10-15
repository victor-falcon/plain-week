import { useSyncExternalStore } from 'react';
import { syncEngine } from '@/lib/sync';
import type { SyncStatus } from '@/lib/sync';

/** 'idle' | 'syncing' | 'offline' | 'error'. Always 'idle' for guests. */
export function useSyncStatus(): SyncStatus {
    return useSyncExternalStore(
        syncEngine.subscribe,
        syncEngine.getStatus,
        syncEngine.getStatus,
    );
}
