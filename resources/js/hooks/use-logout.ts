import { router } from '@inertiajs/react';
import type { MouseEvent } from 'react';
import { clearLocalSession } from '@/lib/sync';
import { logout } from '@/routes';

/**
 * Click handler for logout links: flushes pending changes, wipes the local
 * database and then logs out. `beforeLogout` runs first (e.g. close menus).
 */
export function useLogout(beforeLogout?: () => void) {
    return (event: MouseEvent) => {
        event.preventDefault();
        beforeLogout?.();

        void clearLocalSession().finally(() => {
            router.flushAll();
            router.visit(logout());
        });
    };
}
