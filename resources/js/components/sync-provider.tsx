import { usePage } from '@inertiajs/react';
import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { forgetEndedSession, syncEngine } from '@/lib/sync';

/**
 * Runs the background sync engine while a user is authenticated. Guests keep
 * working locally; a guest page left with a signed-out user's data clears it
 * (`forgetEndedSession`). In SaaS mode it only syncs accounts with a paid
 * plan. Mount it once at the planner root.
 */
export function SyncProvider({ children }: { children: ReactNode }) {
    const { auth, account } = usePage().props;
    const userId = auth?.user?.id ?? null;
    // SaaS mode: an account without a paid plan cannot sync (the server would
    // answer 402), so the engine does not start.
    const canSync = account?.hasAccess ?? true;

    useEffect(() => {
        if (userId === null) {
            forgetEndedSession().catch((error: unknown) => {
                console.warn('Could not check the ended session.', error);
            });

            return;
        }

        if (!canSync) {
            return;
        }

        syncEngine.start(userId);

        return () => syncEngine.stop();
    }, [userId, canSync]);

    return children;
}
