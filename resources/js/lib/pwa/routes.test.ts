import { describe, expect, it } from 'vitest';
import {
    isBuildAsset,
    isServerNavigation,
    isShellNavigation,
} from '@/lib/pwa/routes';

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
    it('matches full-page loads of the planner, with or without a week', () => {
        for (const path of ['/', '/?week=2026-10-12']) {
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
