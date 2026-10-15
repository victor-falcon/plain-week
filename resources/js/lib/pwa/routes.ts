/**
 * Request matchers shared by the service worker (`resources/js/sw.ts`) and its
 * tests. Kept free of service-worker globals so they run in Vitest.
 */

/** Cache holding the last HTML document of `/` (the offline app shell). */
export const SHELL_CACHE = 'plain-week-shell';

/** Cache for built assets that are not in the current precache manifest. */
export const BUILD_ASSETS_CACHE = 'plain-week-build-assets';

/** The page served when a navigation fails offline and nothing is cached. */
export const OFFLINE_FALLBACK_URL = '/offline.html';

/** Every `?week=` variant of the planner shares one cached shell. */
export const SHELL_URL = '/';

type RequestLike = Pick<Request, 'method' | 'mode'>;

function isSameOrigin(url: URL, origin: string): boolean {
    return url.origin === origin;
}

/**
 * A full-page load of the planner. Inertia's own visits are `fetch` requests
 * (mode `cors`/`same-origin`, `X-Inertia` header), never `navigate`, so they
 * always go to the network and asset-version checks keep working.
 */
export function isShellNavigation(
    request: RequestLike,
    url: URL,
    origin: string,
): boolean {
    return (
        request.method === 'GET' &&
        request.mode === 'navigate' &&
        isSameOrigin(url, origin) &&
        url.pathname === SHELL_URL
    );
}

/** A full-page load of any other same-origin page (settings, login, ...). */
export function isServerNavigation(
    request: RequestLike,
    url: URL,
    origin: string,
): boolean {
    return (
        request.method === 'GET' &&
        request.mode === 'navigate' &&
        isSameOrigin(url, origin) &&
        url.pathname !== SHELL_URL
    );
}

/** A Vite-built file (hashed JS/CSS/fonts under `/build/`). */
export function isBuildAsset(
    request: RequestLike,
    url: URL,
    origin: string,
): boolean {
    return (
        request.method === 'GET' &&
        isSameOrigin(url, origin) &&
        url.pathname.startsWith('/build/')
    );
}
