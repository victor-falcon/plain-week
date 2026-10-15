import { router, usePage } from '@inertiajs/react';
import { useRef } from 'react';
import type { MouseEvent } from 'react';
import { toast } from 'sonner';
import { logOut } from '@/lib/sync';
import { logout } from '@/routes';

function confirmDiscard(pendingChanges: number): boolean {
    return window.confirm(
        pendingChanges === 1
            ? '1 change has not been synced yet and will be lost. Log out anyway?'
            : `${pendingChanges} changes have not been synced yet and will be lost. Log out anyway?`,
    );
}

/**
 * Click handler for logout links. It syncs pending changes, asks before
 * discarding any that could not be synced, logs out on the server and then
 * wipes the local database. `beforeLogout` runs first (e.g. close menus).
 */
export function useLogout(beforeLogout?: () => void) {
    const userId = usePage().props.auth?.user?.id ?? null;
    const inProgress = useRef(false);

    return (event: MouseEvent) => {
        event.preventDefault();

        if (inProgress.current || userId === null) {
            return;
        }

        inProgress.current = true;
        beforeLogout?.();

        logOut({ userId, logoutUrl: logout().url, confirmDiscard })
            .then((redirectTo) => {
                if (redirectTo !== null) {
                    router.flushAll();
                    router.visit(redirectTo);
                }
            })
            .catch(() => {
                toast.error('Could not log out. Check your connection.');
            })
            .finally(() => {
                inProgress.current = false;
            });
    };
}
