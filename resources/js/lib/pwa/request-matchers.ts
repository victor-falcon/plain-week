/**
 * Request matchers and cache rules shared by the service worker
 * (`resources/js/sw.ts`) and the page. Kept free of service-worker globals so
 * they run in Vitest.
 */

/** Cache holding the last HTML document of `/` (the offline app shell). */
export const SHELL_CACHE = 'plain-week-shell';

/** Cache for built assets that are not in the current precache manifest. */
export const BUILD_ASSETS_CACHE = 'plain-week-build-assets';

/** The page served when a navigation fails offline and nothing is cached. */
export const OFFLINE_FALLBACK_URL = '/offline.html';

/** Every `?week=` variant of the planner shares one cached shell. */
export const SHELL_URL = '/';

/** Page -> worker: re-fetch and store the shell (the session changed). */
export const REFRESH_SHELL_MESSAGE = 'REFRESH_SHELL';

type RequestLike = Pick<Request, 'method' | 'mode'>;

function isSameOriginGet(
    request: RequestLike,
    url: URL,
    origin: string,
): boolean {
    return request.method === 'GET' && url.origin === origin;
}

function isNavigation(request: RequestLike, url: URL, origin: string): boolean {
    return isSameOriginGet(request, url, origin) && request.mode === 'navigate';
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
    return isNavigation(request, url, origin) && url.pathname === SHELL_URL;
}

/** A full-page load of any other same-origin page (settings, login, ...). */
export function isServerNavigation(
    request: RequestLike,
    url: URL,
    origin: string,
): boolean {
    return isNavigation(request, url, origin) && url.pathname !== SHELL_URL;
}

/** A Vite-built file (hashed JS/CSS/fonts under `/build/`). */
export function isBuildAsset(
    request: RequestLike,
    url: URL,
    origin: string,
): boolean {
    return (
        isSameOriginGet(request, url, origin) &&
        url.pathname.startsWith('/build/')
    );
}

/**
 * Only a plain `200` document is a shell: a redirect (for example to a login
 * page) or an error page is not the planner.
 */
export function isCacheableShell(response: Response): boolean {
    return response.status === 200 && !response.redirected;
}

const PAGE_SCRIPT =
    /(<script data-page="app" type="application\/json">)([\s\S]*?)(<\/script>)/;

/**
 * Points a cached shell's Inertia page at the URL being loaded. The shell is
 * shared by every `?week=` variant, and Inertia writes the page's `url` into
 * the address bar on boot, so without this an offline reload would jump to
 * the week of whichever visit stored the shell.
 */
export function withPageUrl(html: string, pageUrl: string): string {
    return html.replace(PAGE_SCRIPT, (match, open, json, close) => {
        try {
            const page = JSON.parse(json) as { url?: string };
            const updated = JSON.stringify({ ...page, url: pageUrl }).replace(
                /</g,
                '\\u003c',
            );

            return `${open}${updated}${close}`;
        } catch {
            return match;
        }
    });
}
