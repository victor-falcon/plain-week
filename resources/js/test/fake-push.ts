import { vi } from 'vite-plus/test';

/**
 * A browser with Web Push for happy-dom tests: `Notification`, `PushManager`,
 * a service worker registration with a fake push manager, and a mocked
 * `fetch` for the subscription endpoints. Undo with `vi.unstubAllGlobals()`
 * and `uninstallFakePush()`.
 */

/** A valid-looking VAPID public key (65 bytes, base64url). */
export const VAPID_KEY =
    'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U';

function keyBytes(base64url: string): ArrayBuffer {
    const binary = atob(base64url.replace(/-/g, '+').replace(/_/g, '/'));

    return Uint8Array.from(binary, (c) => c.charCodeAt(0)).buffer;
}

export type FakeSubscription = {
    endpoint: string;
    options: { applicationServerKey: ArrayBuffer | null };
    toJSON(): PushSubscriptionJSON;
    unsubscribe: ReturnType<typeof vi.fn>;
};

export type FakePush = {
    permission: NotificationPermission;
    /** What the next permission prompt answers. */
    promptAnswer: NotificationPermission;
    subscription: FakeSubscription | null;
    subscribe: ReturnType<typeof vi.fn>;
    fetch: ReturnType<typeof vi.fn>;
    /** The status `fetch` answers with. */
    status: number;
    /** `fetch` rejects (offline) while true. */
    offline: boolean;
    makeSubscription(key?: string): FakeSubscription;
};

let counter = 0;

export function installFakePush({
    permission = 'default' as NotificationPermission,
    subscribed = false,
} = {}): FakePush {
    const fake: FakePush = {
        permission,
        promptAnswer: 'granted',
        subscription: null,
        status: 204,
        offline: false,
        subscribe: vi.fn(),
        fetch: vi.fn(),
        makeSubscription(key = VAPID_KEY) {
            const endpoint = `https://push.test/send/${++counter}`;
            const subscription: FakeSubscription = {
                endpoint,
                options: { applicationServerKey: keyBytes(key) },
                toJSON: () => ({
                    endpoint,
                    expirationTime: null,
                    keys: { p256dh: 'p256dh-key', auth: 'auth-key' },
                }),
                unsubscribe: vi.fn(() => {
                    if (fake.subscription === subscription) {
                        fake.subscription = null;
                    }

                    return Promise.resolve(true);
                }),
            };

            return subscription;
        },
    };

    fake.subscribe.mockImplementation(
        ({ applicationServerKey }: { applicationServerKey: Uint8Array }) => {
            const key = btoa(String.fromCharCode(...applicationServerKey))
                .replace(/\+/g, '-')
                .replace(/\//g, '_')
                .replace(/=+$/, '');
            fake.subscription = fake.makeSubscription(key);

            return Promise.resolve(fake.subscription);
        },
    );

    fake.fetch.mockImplementation(() =>
        fake.offline
            ? Promise.reject(new TypeError('Failed to fetch'))
            : Promise.resolve(new Response(null, { status: fake.status })),
    );

    if (subscribed) {
        fake.subscription = fake.makeSubscription();
    }

    const registration = {
        active: {},
        pushManager: {
            getSubscription: () => Promise.resolve(fake.subscription),
            subscribe: fake.subscribe,
        },
    };

    class FakeNotification {
        static get permission() {
            return fake.permission;
        }

        static requestPermission() {
            if (fake.permission === 'default') {
                fake.permission = fake.promptAnswer;
            }

            return Promise.resolve(fake.permission);
        }
    }

    class FakePushManager {
        static supportedContentEncodings = ['aes128gcm', 'aesgcm'];
    }

    vi.stubGlobal('Notification', FakeNotification);
    vi.stubGlobal('PushManager', FakePushManager);
    vi.stubGlobal('fetch', fake.fetch);
    Object.defineProperty(navigator, 'serviceWorker', {
        configurable: true,
        value: {
            getRegistration: () => Promise.resolve(registration),
            ready: Promise.resolve(registration),
        },
    });

    return fake;
}

export function uninstallFakePush(): void {
    vi.unstubAllGlobals();
    Reflect.deleteProperty(navigator, 'serviceWorker');
}

/** The JSON body of the `n`th `fetch` call. */
export function requestBody(fake: FakePush, n = 0): unknown {
    const init = fake.fetch.mock.calls[n][1] as RequestInit;

    return JSON.parse(init.body as string);
}
