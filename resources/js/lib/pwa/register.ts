import { registerSW } from 'virtual:pwa-register';
import { showUpdateToast } from '@/lib/pwa/update-toast';

const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;

/**
 * Registers the service worker (production builds only; a no-op under the
 * Vite dev server) and prompts when a new version is waiting.
 */
export function registerServiceWorker(): void {
    const updateServiceWorker = registerSW({
        onNeedRefresh: () => showUpdateToast(() => updateServiceWorker()),
        onRegisteredSW: (_url, registration) => {
            if (!registration) {
                return;
            }

            // Long-lived tabs also learn about new deploys.
            setInterval(() => {
                if (navigator.onLine) {
                    void registration.update();
                }
            }, UPDATE_CHECK_INTERVAL_MS);
        },
    });
}
