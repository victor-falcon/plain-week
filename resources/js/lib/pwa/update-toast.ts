import { toast } from 'sonner';

const UPDATE_TOAST_ID = 'pwa-update';

/**
 * Tells the user a new version is ready. "Reload" activates the waiting
 * service worker and reloads the page; dismissing keeps the current version
 * until the next visit.
 */
export function showUpdateToast(update: () => Promise<void>): void {
    toast('Update available', {
        id: UPDATE_TOAST_ID,
        duration: Infinity,
        action: {
            label: 'Reload',
            onClick: () => void update(),
        },
    });
}
