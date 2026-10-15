import { router } from '@inertiajs/react';
import { registerSW } from 'virtual:pwa-register';
import { notifyOfflineVisits } from '@/lib/pwa/offline-visits';
import { REFRESH_SHELL_MESSAGE } from '@/lib/pwa/request-matchers';
import { createSessionChangeDetector } from '@/lib/pwa/session-change';
import { showUpdateToast } from '@/lib/pwa/update-toast';

const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;

/**
 * Registers the service worker (production builds only) and prompts when a
 * new version is waiting.
 */
export function registerServiceWorker(): void {
    if (import.meta.env.DEV) {
        // A worker left over from testing a production build on this origin
        // would otherwise keep answering for the dev app.
        void navigator.serviceWorker?.getRegistrations().then((registrations) =>
            registrations.forEach((registration) => {
                void registration.unregister();
            }),
        );

        return;
    }

    const updateServiceWorker = registerSW({
        onNeedRefresh: () => showUpdateToast(() => updateServiceWorker()),
        onRegisteredSW: (_url, registration) => {
            if (!registration) {
                return;
            }

            // Long-lived tabs also learn about new deploys. Lives as long as
            // the page, like the registration itself.
            setInterval(() => {
                if (navigator.onLine) {
                    void registration.update();
                }
            }, UPDATE_CHECK_INTERVAL_MS);
        },
    });

    refreshShellOnSessionChange();
    notifyOfflineVisits();
}

/**
 * The cached shell embeds the page props of the visit that stored it, so a
 * login or logout (Inertia visits, not full page loads) asks the worker to
 * store a fresh one. Otherwise an offline reload would show the previous
 * session.
 */
function refreshShellOnSessionChange(): void {
    const sessionChanged = createSessionChangeDetector();
    const check = (user: unknown) => {
        if (sessionChanged(user)) {
            navigator.serviceWorker?.controller?.postMessage({
                type: REFRESH_SHELL_MESSAGE,
            });
        }
    };

    // `navigate` covers the first page and history; `success` also covers
    // same-URL visits, such as the logout's visit to `/` from the planner.
    router.on('navigate', (event) => check(event.detail.page.props.auth?.user));
    router.on('success', (event) => check(event.detail.page.props.auth?.user));
}
