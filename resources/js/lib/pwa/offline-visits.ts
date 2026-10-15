import { router } from '@inertiajs/react';
import { toast } from 'sonner';

const OFFLINE_VISIT_TOAST_ID = 'offline-visit';

/**
 * Inertia visits to server pages (settings, login, ...) are `fetch` requests,
 * so the worker's offline page never shows for them. Tell the user instead of
 * failing silently. Hover prefetches failing offline stay quiet.
 */
export function notifyOfflineVisits(): void {
    let activeVisits = 0;

    router.on('start', (event) => {
        if (!event.detail.visit.prefetch) {
            activeVisits++;
        }
    });

    router.on('finish', (event) => {
        if (!event.detail.visit.prefetch) {
            activeVisits = Math.max(0, activeVisits - 1);
        }
    });

    router.on('networkError', (event) => {
        if (activeVisits > 0) {
            // Handled: Inertia does not rethrow it as an uncaught error. Failed
            // prefetches must keep the default, which clears Inertia's
            // prefetch cache so a later click still sends a real visit.
            event.preventDefault();
            toast.error("You're offline. This page needs a connection.", {
                id: OFFLINE_VISIT_TOAST_ID,
            });
        }
    });
}
