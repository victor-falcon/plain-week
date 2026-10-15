import { usePage } from '@inertiajs/react';
import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { syncEngine } from '@/lib/sync';

/**
 * Runs the background sync engine while a user is authenticated. Guests keep
 * working locally. Mount it once at the planner root.
 */
export function SyncProvider({ children }: { children: ReactNode }) {
    const userId = usePage().props.auth?.user?.id ?? null;

    useEffect(() => {
        if (userId === null) {
            return;
        }

        syncEngine.start(userId);

        return () => syncEngine.stop();
    }, [userId]);

    return children;
}
