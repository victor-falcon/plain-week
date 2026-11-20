import { router, usePage } from '@inertiajs/react';
import { useRef } from 'react';
import { toast } from 'sonner';
import { logOut } from '@/lib/sync';
import { logout } from '@/routes';
import { t } from '@/lib/i18n';

function confirmDiscard(pendingChanges: number): boolean {
    return window.confirm(t('auth.logOutUnsynced', { count: pendingChanges }));
}

/**
 * Returns the logout action for menus and links (links must prevent their own
 * navigation). It syncs pending changes, asks before
 * discarding any that could not be synced, logs out on the server and then
 * wipes the local database. `beforeLogout` runs first (e.g. close menus).
 */
export function useLogout(beforeLogout?: () => void) {
    const userId = usePage().props.auth?.user?.id ?? null;
    const inProgress = useRef(false);

    return () => {
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
                toast.error(t('auth.logOutFailed'));
            })
            .finally(() => {
                inProgress.current = false;
            });
    };
}
