import { usePage } from '@inertiajs/react';
import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { forgetEndedSession, syncEngine } from '@/lib/sync';

/**
 * Runs the background sync engine while a user is authenticated. Guests keep
 * working locally; a guest page left with a signed-out user's data clears it
 * (`forgetEndedSession`). Mount it once at the planner root.
 */
export function SyncProvider({ children }: { children: ReactNode }) {
    const userId = usePage().props.auth?.user?.id ?? null;

    useEffect(() => {
        if (userId === null) {
            forgetEndedSession().catch((error: unknown) => {
                console.warn('Could not check the ended session.', error);
            });

            return;
        }

        syncEngine.start(userId);

        return () => syncEngine.stop();
    }, [userId]);

    return children;
}
