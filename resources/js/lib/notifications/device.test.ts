// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import {
    decodeServerKey,
    deviceState,
    disable,
    enable,
    forget,
    pushSupport,
    refreshSubscription,
} from '@/lib/notifications/device';
import {
    VAPID_KEY,
    installFakePush,
    requestBody,
    uninstallFakePush,
} from '@/test/fake-push';

const OTHER_KEY =
    'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM';

function stubUserAgent(userAgent: string, standalone = false) {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(userAgent);
    vi.stubGlobal(
        'matchMedia',
        vi.fn(() => ({ matches: standalone })),
    );
}

afterEach(() => {
    uninstallFakePush();
    vi.restoreAllMocks();
});

describe('pushSupport', () => {
    it('is supported with a service worker, PushManager and Notification', () => {
        installFakePush();

        expect(pushSupport()).toBe('supported');
    });

    it('is unsupported without Web Push', () => {
        expect(pushSupport()).toBe('unsupported');
    });

    it('asks iOS Safari to add the app to the Home Screen', () => {
        stubUserAgent(
            'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
        );

        expect(pushSupport()).toBe('needs-install');
    });

    it('works in the app added to the Home Screen on iOS', () => {
        installFakePush();
        stubUserAgent(
            'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
            true,
        );

        expect(pushSupport()).toBe('supported');
    });
});

describe('deviceState', () => {
    it('is enabled with a subscription and the permission', async () => {
        installFakePush({ permission: 'granted', subscribed: true });

        expect(await deviceState()).toEqual({
            support: 'supported',
            permission: 'granted',
            enabled: true,
        });
    });

    it('is off without a subscription, or when notifications are blocked', async () => {
        installFakePush({ permission: 'granted' });
        expect((await deviceState()).enabled).toBe(false);

        uninstallFakePush();
        installFakePush({ permission: 'denied', subscribed: true });
        expect(await deviceState()).toEqual({
            support: 'supported',
            permission: 'denied',
            enabled: false,
        });
    });
});

describe('decodeServerKey', () => {
    it('decodes a base64url key without padding', () => {
        expect(Array.from(decodeServerKey('AP-_'))).toEqual([0, 255, 191]);
        expect(decodeServerKey(VAPID_KEY)).toHaveLength(65);
    });
});

describe('enable', () => {
    it('asks for the permission, subscribes and posts the subscription', async () => {
        const fake = installFakePush();

        expect(await enable(VAPID_KEY)).toBe(true);

        expect(fake.subscribe).toHaveBeenCalledWith({
            userVisibleOnly: true,
            applicationServerKey: decodeServerKey(VAPID_KEY),
        });
        expect(fake.fetch).toHaveBeenCalledWith(
            '/notifications/subscriptions',
            expect.objectContaining({ method: 'POST' }),
        );
        expect(requestBody(fake)).toEqual({
            endpoint: fake.subscription?.endpoint,
            expirationTime: null,
            keys: { p256dh: 'p256dh-key', auth: 'auth-key' },
            content_encoding: 'aes128gcm',
        });
        expect((await deviceState()).enabled).toBe(true);
    });

    it("sends the browser's time zone, like sync", async () => {
        const fake = installFakePush();

        await enable(VAPID_KEY);

        const headers = new Headers(
            (fake.fetch.mock.calls[0][1] as RequestInit).headers,
        );
        expect(headers.get('X-Timezone')).toBe(
            Intl.DateTimeFormat().resolvedOptions().timeZone,
        );
    });

    it('does nothing when the permission is refused', async () => {
        const fake = installFakePush();
        fake.promptAnswer = 'denied';

        expect(await enable(VAPID_KEY)).toBe(false);

        expect(fake.subscribe).not.toHaveBeenCalled();
        expect(fake.fetch).not.toHaveBeenCalled();
    });

    it('unsubscribes again when the server cannot be told', async () => {
        const fake = installFakePush();
        fake.offline = true;

        await expect(enable(VAPID_KEY)).rejects.toThrow();

        expect(fake.subscription).toBeNull();
    });

    it('throws on a server error', async () => {
        const fake = installFakePush();
        fake.status = 500;

        await expect(enable(VAPID_KEY)).rejects.toThrow('HTTP 500');
        expect(fake.subscription).toBeNull();
    });

    it('replaces a subscription made with other server keys', async () => {
        const fake = installFakePush({ permission: 'granted' });
        const stale = fake.makeSubscription(OTHER_KEY);
        fake.subscription = stale;

        await enable(VAPID_KEY);

        expect(stale.unsubscribe).toHaveBeenCalled();
        expect(fake.subscribe).toHaveBeenCalled();
        expect(fake.subscription).not.toBe(stale);
    });

    it('reuses a subscription made with the same key', async () => {
        const fake = installFakePush({
            permission: 'granted',
            subscribed: true,
        });
        const existing = fake.subscription;

        await enable(VAPID_KEY);

        expect(fake.subscribe).not.toHaveBeenCalled();
        expect(fake.subscription).toBe(existing);
        expect(fake.fetch).toHaveBeenCalledTimes(1);
    });

    it('keeps a subscription it did not make when the server cannot be told', async () => {
        const fake = installFakePush({
            permission: 'granted',
            subscribed: true,
        });
        const existing = fake.subscription;
        fake.offline = true;

        await expect(enable(VAPID_KEY)).rejects.toThrow();

        expect(fake.subscription).toBe(existing);
    });
});

describe('disable', () => {
    it('unsubscribes and tells the server', async () => {
        const fake = installFakePush({
            permission: 'granted',
            subscribed: true,
        });
        const endpoint = fake.subscription?.endpoint;

        await disable();

        expect(fake.subscription).toBeNull();
        expect(fake.fetch).toHaveBeenCalledWith(
            '/notifications/subscriptions',
            expect.objectContaining({ method: 'DELETE' }),
        );
        expect(requestBody(fake)).toEqual({ endpoint });
    });

    it('still turns off offline', async () => {
        const fake = installFakePush({
            permission: 'granted',
            subscribed: true,
        });
        fake.offline = true;

        await disable();

        expect(fake.subscription).toBeNull();
    });
});

describe('refreshSubscription', () => {
    it('re-posts an existing subscription', async () => {
        const fake = installFakePush({
            permission: 'granted',
            subscribed: true,
        });

        await refreshSubscription(VAPID_KEY);

        expect(requestBody(fake)).toMatchObject({
            endpoint: fake.subscription?.endpoint,
        });
    });

    it('subscribes again when the server keys changed', async () => {
        const fake = installFakePush({ permission: 'granted' });
        fake.subscription = fake.makeSubscription(OTHER_KEY);

        await refreshSubscription(VAPID_KEY);

        expect(fake.subscribe).toHaveBeenCalled();
        expect(fake.fetch).toHaveBeenCalledTimes(1);
    });

    it('does nothing without a subscription or the permission', async () => {
        let fake = installFakePush({ permission: 'granted' });
        await refreshSubscription(VAPID_KEY);
        expect(fake.fetch).not.toHaveBeenCalled();

        uninstallFakePush();
        fake = installFakePush({ permission: 'denied', subscribed: true });
        await refreshSubscription(VAPID_KEY);
        expect(fake.fetch).not.toHaveBeenCalled();
    });

    it('never throws', async () => {
        const fake = installFakePush({
            permission: 'granted',
            subscribed: true,
        });
        fake.offline = true;

        await expect(refreshSubscription(VAPID_KEY)).resolves.toBe(false);

        fake.offline = false;
        fake.status = 503;
        await expect(refreshSubscription(VAPID_KEY)).resolves.toBe(false);
    });

    it('does not retry a refusal', async () => {
        const fake = installFakePush({
            permission: 'granted',
            subscribed: true,
        });
        fake.status = 402;

        await expect(refreshSubscription(VAPID_KEY)).resolves.toBe(true);
    });
});

describe('forget', () => {
    it('unsubscribes without calling the server', async () => {
        const fake = installFakePush({
            permission: 'granted',
            subscribed: true,
        });

        await forget();

        expect(fake.subscription).toBeNull();
        expect(fake.fetch).not.toHaveBeenCalled();
    });
});
