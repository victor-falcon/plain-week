import { describe, expect, it } from 'vitest';
import {
    isBuildAsset,
    isCacheableShell,
    isServerNavigation,
    isShellNavigation,
    withPageUrl,
} from '@/lib/pwa/request-matchers';

const origin = 'https://planner.test';

function request(
    path: string,
    { method = 'GET', mode = 'navigate' as RequestMode } = {},
) {
    return {
        request: { method, mode },
        url: new URL(path, origin),
    };
}

describe('isShellNavigation', () => {
    it('matches full-page loads of the planner, with or without a week or task', () => {
        for (const path of [
            '/',
            '/?week=2026-10-12',
            '/?task=0199a1b2-c3d4',
            '/?task=0199a1b2-c3d4%3A2026-10-14',
        ]) {
            const { request: r, url } = request(path);
            expect(isShellNavigation(r, url, origin)).toBe(true);
        }
    });

    it('ignores Inertia visits, other pages, other origins and non-GET', () => {
        const cases = [
            request('/', { mode: 'cors' }),
            request('/', { mode: 'same-origin' }),
            request('/settings/profile'),
            request('/', { method: 'POST' }),
            {
                request: { method: 'GET', mode: 'navigate' as RequestMode },
                url: new URL('https://elsewhere.test/'),
            },
        ];

        for (const { request: r, url } of cases) {
            expect(isShellNavigation(r, url, origin)).toBe(false);
        }
    });
});

describe('isServerNavigation', () => {
    it('matches full-page loads of server pages only', () => {
        const login = request('/login');
        const shell = request('/');
        const visit = request('/login', { mode: 'cors' });

        expect(isServerNavigation(login.request, login.url, origin)).toBe(true);
        expect(isServerNavigation(shell.request, shell.url, origin)).toBe(
            false,
        );
        expect(isServerNavigation(visit.request, visit.url, origin)).toBe(
            false,
        );
    });
});

describe('isBuildAsset', () => {
    it('matches GETs under /build/ and nothing else', () => {
        const asset = request('/build/assets/app-abc123.js', { mode: 'cors' });
        const sync = request('/sync/pull', { mode: 'cors' });
        const post = request('/build/assets/app.js', { method: 'POST' });

        expect(isBuildAsset(asset.request, asset.url, origin)).toBe(true);
        expect(isBuildAsset(sync.request, sync.url, origin)).toBe(false);
        expect(isBuildAsset(post.request, post.url, origin)).toBe(false);
    });
});

describe('isCacheableShell', () => {
    it('accepts plain 200 documents only', () => {
        const redirected = new Response('login');
        Object.defineProperty(redirected, 'redirected', { value: true });

        expect(isCacheableShell(new Response('planner'))).toBe(true);
        expect(isCacheableShell(redirected)).toBe(false);
        expect(isCacheableShell(new Response('', { status: 500 }))).toBe(false);
    });
});

describe('withPageUrl', () => {
    // Laravel escapes `/` in the page JSON, as the server does.
    const shell = (page: object) =>
        `<body><script data-page="app" type="application/json">${JSON.stringify(page).replaceAll('/', '\\/')}</script><div id="app"></div></body>`;

    it('replaces the Inertia page url and keeps the rest of the page', () => {
        const html = withPageUrl(
            shell({ component: 'planner', url: '/?week=2026-11-02' }),
            '/?week=2026-11-09',
        );

        expect(html).toContain('"url":"/?week=2026-11-09"');
        expect(html).toContain('"component":"planner"');
        expect(html).toContain('<div id="app"></div></body>');
    });

    it('keeps props from closing the script tag', () => {
        const html = withPageUrl(
            shell({ props: { name: '</script><b>' }, url: '/' }),
            '/',
        );

        expect(html).not.toContain('</script><b>');
        expect(html).toContain('\\u003c/script>\\u003cb>');
    });

    it('leaves documents without a valid page untouched', () => {
        const broken =
            '<script data-page="app" type="application/json">{oops</script>';

        expect(withPageUrl(broken, '/')).toBe(broken);
        expect(withPageUrl('<p>hi</p>', '/')).toBe('<p>hi</p>');
    });
});
