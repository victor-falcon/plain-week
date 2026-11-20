import { router } from '@inertiajs/react';
import { currentLocale } from '@/lib/i18n';
import { REFRESH_SHELL_MESSAGE } from '@/lib/pwa/request-matchers';

/**
 * The catalog is set once per page load, so a server response in another
 * language (a language change in Settings, a login into an account with its
 * own language) reloads the page to render it. Only server responses count:
 * a history visit restores old props and must not trigger a reload. The
 * service worker re-caches the shell in the new language too.
 */
export function reloadOnLocaleChange(): void {
    router.on('success', (event) => {
        const locale = event.detail.page.props.i18n?.locale;

        if (locale && locale !== currentLocale()) {
            // The cached offline shell embeds the old language's props.
            navigator.serviceWorker?.controller?.postMessage({
                type: REFRESH_SHELL_MESSAGE,
            });
            window.location.reload();
        }
    });
}
