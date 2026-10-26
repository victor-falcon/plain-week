/// <reference lib="webworker" />
/**
 * Service worker: the offline app shell (docs/architecture.md, "Offline app
 * shell"). Built by vite-plugin-pwa (`injectManifest`) into `public/sw.js`.
 *
 * - Precaches every built JS/CSS/font file.
 * - `/` (the planner document) is NetworkFirst with a cache fallback, so a
 *   reload while offline serves the last shell and the local database does the
 *   rest.
 * - Other pages are network-only; offline they get `/offline.html`.
 * - Everything else (`/sync/*`, Inertia visits, any non-GET) is untouched.
 * - Web Push: shows the server's notifications and opens their task link.
 */
import { CacheableResponsePlugin } from 'workbox-cacheable-response';
import { clientsClaim } from 'workbox-core';
import type { RouteHandlerCallbackOptions } from 'workbox-core';
import { ExpirationPlugin } from 'workbox-expiration';
import {
    cleanupOutdatedCaches,
    matchPrecache,
    precacheAndRoute,
} from 'workbox-precaching';
import { registerRoute, setCatchHandler } from 'workbox-routing';
import { CacheFirst, NetworkFirst, NetworkOnly } from 'workbox-strategies';
import {
    notificationFor,
    notificationUrl,
    openNotificationUrl,
    parsePushPayload,
} from '@/lib/pwa/push-handlers';
import {
    BUILD_ASSETS_CACHE,
    OFFLINE_FALLBACK_URL,
    REFRESH_SHELL_MESSAGE,
    SHELL_CACHE,
    SHELL_URL,
    isBuildAsset,
    isCacheableShell,
    isServerNavigation,
    isShellNavigation,
    withPageUrl,
} from '@/lib/pwa/request-matchers';

declare const self: ServiceWorkerGlobalScope;

const origin = self.location.origin;
const shellUrl = new URL(SHELL_URL, origin).href;

// vite-plugin-pwa lists the web manifest relative to this worker, but it is
// built into /build/ with the other assets.
precacheAndRoute(
    self.__WB_MANIFEST.map((entry) =>
        typeof entry !== 'string' && entry.url === 'manifest.webmanifest'
            ? { ...entry, url: '/build/manifest.webmanifest' }
            : entry,
    ),
);
cleanupOutdatedCaches();

const shellStrategy = new NetworkFirst({
    cacheName: SHELL_CACHE,
    networkTimeoutSeconds: 3,
    plugins: [
        {
            // `/?week=...` and `/` are the same document.
            cacheKeyWillBeUsed: () => Promise.resolve(shellUrl),
            cacheWillUpdate: ({ response }) =>
                Promise.resolve(isCacheableShell(response) ? response : null),
            // `request` here is the normalized cache key; the event still
            // holds the URL being loaded.
            cachedResponseWillBeUsed: ({ cachedResponse, event }) =>
                cachedResponse
                    ? shellFor(
                          cachedResponse,
                          (event as FetchEvent).request.url,
                      )
                    : Promise.resolve(null),
        },
    ],
});

/** The cached shell, pointed at the URL being loaded (see `withPageUrl`). */
async function shellFor(cached: Response, requestUrl: string) {
    const url = new URL(requestUrl);
    const html = withPageUrl(await cached.text(), url.pathname + url.search);

    const headers = new Headers(cached.headers);
    headers.delete('content-length');

    return new Response(html, {
        status: cached.status,
        statusText: cached.statusText,
        headers,
    });
}

/** Fetches `/` with the current session and stores it as the shell. */
async function refreshShell(): Promise<void> {
    try {
        const response = await fetch(shellUrl, { credentials: 'same-origin' });

        if (isCacheableShell(response)) {
            const cache = await caches.open(SHELL_CACHE);
            await cache.put(shellUrl, response);
        }
    } catch {
        // Offline: keep the shell we have.
    }
}

// NetworkFirst only falls back on network errors; an error page while the
// server restarts (502/503) should not replace a planner that works offline.
registerRoute(
    ({ request, url }) => isShellNavigation(request, url, origin),
    async (options: RouteHandlerCallbackOptions) => {
        const response = await shellStrategy.handle(options);

        if (response.status >= 500) {
            const cached = await caches.match(shellUrl, {
                cacheName: SHELL_CACHE,
            });

            return cached ? shellFor(cached, options.request.url) : response;
        }

        return response;
    },
);

registerRoute(
    ({ request, url }) => isServerNavigation(request, url, origin),
    new NetworkOnly(),
);

const buildAssetsStrategy = new CacheFirst({
    cacheName: BUILD_ASSETS_CACHE,
    plugins: [
        new CacheableResponsePlugin({ statuses: [200] }),
        new ExpirationPlugin({
            maxEntries: 200,
            maxAgeSeconds: 30 * 24 * 60 * 60,
            purgeOnQuotaError: true,
        }),
    ],
});

// Built files missing from this worker's precache: a newer deploy's files
// loaded by the page before this worker updated, or the files a waiting
// worker already precached (all versions share the precache storage).
registerRoute(
    ({ request, url }) => isBuildAsset(request, url, origin),
    async (options: RouteHandlerCallbackOptions) =>
        (await caches.match(options.request)) ??
        buildAssetsStrategy.handle(options),
);

setCatchHandler(async ({ request }) => {
    if (request.mode === 'navigate') {
        return (await matchPrecache(OFFLINE_FALLBACK_URL)) ?? Response.error();
    }

    return Response.error();
});

// The first visit loads `/` before this worker controls the page, so store
// the shell now: an offline reload right after the first visit must work.
self.addEventListener('install', (event) => {
    event.waitUntil(refreshShell());
});

self.addEventListener('message', (event) => {
    const type = (event.data as { type?: string } | null)?.type;

    // Sent by the "Update available" toast (vite-plugin-pwa's registerSW).
    if (type === 'SKIP_WAITING') {
        void self.skipWaiting();
    }

    // Sent after a login or logout: the shell embeds the session's page props.
    if (type === REFRESH_SHELL_MESSAGE) {
        event.waitUntil(refreshShell());
    }
});

self.addEventListener('push', (event) => {
    event.waitUntil(
        self.registration.showNotification(
            ...notificationFor(parsePushPayload(event.data)),
        ),
    );
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    event.waitUntil(
        openNotificationUrl(
            self.clients,
            notificationUrl(event.notification.data, origin),
            origin,
        ),
    );
});

clientsClaim();
