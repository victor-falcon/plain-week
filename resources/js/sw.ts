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
    BUILD_ASSETS_CACHE,
    OFFLINE_FALLBACK_URL,
    SHELL_CACHE,
    SHELL_URL,
    isBuildAsset,
    isServerNavigation,
    isShellNavigation,
} from '@/lib/pwa/routes';

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
        new CacheableResponsePlugin({ statuses: [200] }),
        {
            // `/?week=...` and `/` are the same document.
            cacheKeyWillBeUsed: () => Promise.resolve(shellUrl),
            // A redirect (for example to a login page) is not the planner.
            cacheWillUpdate: ({ response }) =>
                Promise.resolve(response.redirected ? null : response),
        },
    ],
});

registerRoute(
    ({ request, url }) => isShellNavigation(request, url, origin),
    shellStrategy,
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
    event.waitUntil(
        caches
            .open(SHELL_CACHE)
            .then(async (cache) => {
                const response = await fetch(shellUrl, {
                    credentials: 'same-origin',
                });

                if (response.ok && !response.redirected) {
                    await cache.put(shellUrl, response);
                }
            })
            .catch(() => undefined),
    );
});

// Activated on demand from the "Update available" toast.
self.addEventListener('message', (event) => {
    if ((event.data as { type?: string } | null)?.type === 'SKIP_WAITING') {
        void self.skipWaiting();
    }
});

clientsClaim();
