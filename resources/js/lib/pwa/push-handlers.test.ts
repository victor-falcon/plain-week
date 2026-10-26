import { describe, expect, it, vi } from 'vite-plus/test';
import {
    NOTIFICATION_BADGE,
    NOTIFICATION_ICON,
    notificationFor,
    notificationUrl,
    openNotificationUrl,
    parsePushPayload,
} from '@/lib/pwa/push-handlers';
import type { WindowClientLike } from '@/lib/pwa/push-handlers';

const origin = 'https://planner.test';

function pushData(value: unknown) {
    return {
        json: () =>
            typeof value === 'string' ? JSON.parse(value) : (value as object),
    };
}

describe('parsePushPayload', () => {
    it('reads the contract fields', () => {
        expect(
            parsePushPayload(
                pushData({
                    title: 'Gym',
                    body: 'Today at 17:30',
                    url: '/?task=0199',
                    tag: 'morning:0199:2026-10-26',
                }),
            ),
        ).toEqual({
            title: 'Gym',
            body: 'Today at 17:30',
            url: '/?task=0199',
            tag: 'morning:0199:2026-10-26',
        });
    });

    it('falls back to a plain notification about the planner', () => {
        const fallback = { title: 'Plain Week', body: '', url: '/', tag: '' };

        expect(parsePushPayload(null)).toEqual(fallback);
        expect(parsePushPayload(pushData('not json'))).toEqual(fallback);
        expect(parsePushPayload(pushData({ title: 3, url: '' }))).toEqual(
            fallback,
        );
    });
});

describe('notificationFor', () => {
    it('builds the showNotification arguments', () => {
        expect(
            notificationFor({
                title: 'Gym',
                body: 'In 5 minutes · 17:30',
                url: '/?task=0199',
                tag: 'reminder:0199:2026-10-26',
            }),
        ).toEqual([
            'Gym',
            {
                body: 'In 5 minutes · 17:30',
                tag: 'reminder:0199:2026-10-26',
                data: { url: '/?task=0199' },
                icon: NOTIFICATION_ICON,
                badge: NOTIFICATION_BADGE,
            },
        ]);
    });

    it('leaves the tag out when there is none', () => {
        const [, options] = notificationFor({
            title: 'Gym',
            body: '',
            url: '/',
            tag: '',
        });

        expect(options).not.toHaveProperty('tag');
    });
});

describe('notificationUrl', () => {
    it('resolves same-origin paths', () => {
        expect(
            notificationUrl({ url: '/?task=0199%3A2026-10-26' }, origin),
        ).toBe('https://planner.test/?task=0199%3A2026-10-26');
    });

    it('opens the planner for other origins or missing URLs', () => {
        for (const data of [
            { url: 'https://evil.test/?task=1' },
            { url: 42 },
            null,
            undefined,
        ]) {
            expect(notificationUrl(data, origin)).toBe('https://planner.test/');
        }
    });
});

function windowClient(
    url: string,
    {
        focused = false,
        visibilityState = 'hidden' as DocumentVisibilityState,
        navigate = vi.fn(() => Promise.resolve()),
    } = {},
) {
    return {
        url,
        focused,
        visibilityState,
        focus: vi.fn(() => Promise.resolve()),
        navigate,
    } satisfies WindowClientLike;
}

function clientsWith(windows: WindowClientLike[]) {
    return {
        matchAll: vi.fn(() => Promise.resolve(windows)),
        openWindow: vi.fn(() => Promise.resolve(null)),
    };
}

describe('openNotificationUrl', () => {
    const url = 'https://planner.test/?task=0199';

    it('loads the task link in an open Plain Week window and focuses it', async () => {
        const other = windowClient('https://other.test/', { focused: true });
        const planner = windowClient('https://planner.test/?week=2026-10-19');
        const clients = clientsWith([other, planner]);

        await openNotificationUrl(clients, url, origin);

        expect(planner.navigate).toHaveBeenCalledWith(url);
        expect(planner.focus).toHaveBeenCalled();
        expect(other.navigate).not.toHaveBeenCalled();
        expect(clients.openWindow).not.toHaveBeenCalled();
    });

    it('prefers the focused window, then a visible one', async () => {
        const hidden = windowClient('https://planner.test/');
        const visible = windowClient('https://planner.test/', {
            visibilityState: 'visible',
        });
        const focused = windowClient('https://planner.test/', {
            focused: true,
            visibilityState: 'visible',
        });

        await openNotificationUrl(
            clientsWith([hidden, visible, focused]),
            url,
            origin,
        );
        expect(focused.navigate).toHaveBeenCalled();

        await openNotificationUrl(clientsWith([hidden, visible]), url, origin);
        expect(visible.navigate).toHaveBeenCalled();
        expect(hidden.navigate).not.toHaveBeenCalled();
    });

    it('opens a window when none is open', async () => {
        const clients = clientsWith([]);

        await openNotificationUrl(clients, url, origin);

        expect(clients.openWindow).toHaveBeenCalledWith(url);
    });

    it('opens a window instead when the open one cannot be navigated', async () => {
        const planner = windowClient('https://planner.test/', {
            navigate: vi.fn(() =>
                Promise.reject(new TypeError('Not controlled')),
            ),
        });
        const clients = clientsWith([planner]);

        await openNotificationUrl(clients, url, origin);

        expect(planner.focus).not.toHaveBeenCalled();
        expect(clients.openWindow).toHaveBeenCalledWith(url);
    });
});
