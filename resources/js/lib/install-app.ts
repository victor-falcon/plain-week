import { createOnceCardStore } from '@/lib/once-card';

/**
 * Whether the "Install the mobile app" card is open: "Install mobile app" in
 * the account menu opens it (`open`), the planner page's first-visit prompt
 * once (`openOnce`); closing it sets `plain-week.install-app-seen`.
 */
export const installAppStore = createOnceCardStore(
    'plain-week.install-app-seen',
);

/**
 * A desktop browser, where the card makes sense: a wide screen with a mouse,
 * not the installed app.
 */
export function isDesktopBrowser(): boolean {
    if (typeof window.matchMedia !== 'function') {
        return false;
    }

    return (
        window.matchMedia('(min-width: 1024px) and (pointer: fine)').matches &&
        !window.matchMedia('(display-mode: standalone)').matches
    );
}

/**
 * Whether a phone can open this address: not a loopback host (`localhost`,
 * `127.0.0.1`, `::1`), which on the phone would point at the phone itself.
 */
export function isReachableFromPhone(): boolean {
    const host = window.location.hostname;

    return !(
        host === 'localhost' ||
        host.endsWith('.localhost') ||
        host === '[::1]' ||
        host.startsWith('127.')
    );
}

/**
 * Whether the account menu offers "Install mobile app": a phone can open this
 * address and this is not a touch screen (there you are already on the phone).
 */
export function canOfferInstall(): boolean {
    const coarse =
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(pointer: coarse)').matches;

    return isReachableFromPhone() && !coarse;
}
