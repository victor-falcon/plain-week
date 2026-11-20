import { router } from '@inertiajs/react';
import { currentLocale } from '@/lib/i18n';

/**
 * The catalog is set once per page load, so a server response in another
 * language (a language change in Settings, a login into an account with its
 * own language) reloads the page to render it. Only server responses count:
 * a history visit restores old props and must not trigger a reload.
 */
export function reloadOnLocaleChange(): void {
    router.on('success', (event) => {
        const locale = event.detail.page.props.i18n?.locale;

        if (locale && locale !== currentLocale()) {
            window.location.reload();
        }
    });
}
