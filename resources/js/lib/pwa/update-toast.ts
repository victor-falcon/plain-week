import { toast } from 'sonner';
import { t } from '@/lib/i18n';

const UPDATE_TOAST_ID = 'pwa-update';

/**
 * Tells the user a new version is ready. "Reload" activates the waiting
 * service worker and reloads the page; dismissing keeps the current version
 * until the next visit.
 */
export function showUpdateToast(update: () => Promise<void>): void {
    toast(t('pwa.updateAvailable'), {
        id: UPDATE_TOAST_ID,
        duration: Infinity,
        action: {
            label: t('pwa.reload'),
            onClick: () => void update(),
        },
    });
}
