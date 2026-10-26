import { SyncHttpError, send, timeZoneHeader } from '@/lib/sync/transport';
import {
    destroy,
    store as storeRoute,
} from '@/routes/notifications/subscriptions';

/**
 * Web Push on this device (docs/architecture.md, "Notifications (client)"). The
 * browser's push subscription is the per-device setting: notifications are
 * on here while it exists and the permission is granted. The server only
 * learns about it; nothing in the planner waits on any of this.
 */

/**
 * - `supported`: this browser can subscribe.
 * - `needs-install`: iOS/iPadOS, where Web Push only works in the app added
 *   to the Home Screen (iOS 16.4+).
 * - `unsupported`: no Web Push in this browser.
 */
export type PushSupport = 'supported' | 'needs-install' | 'unsupported';

export type DeviceState = {
    support: PushSupport;
    permission: NotificationPermission;
    /** A subscription exists and notifications are allowed. */
    enabled: boolean;
};

/** How long `enable()` waits for the service worker to be active. */
export const WORKER_READY_TIMEOUT_MS = 10_000;

function isIos(): boolean {
    return (
        /iPad|iPhone|iPod/.test(navigator.userAgent) ||
        // iPadOS reports itself as a Mac.
        (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
    );
}

/** Opened from the Home Screen (or any installed app window). */
function isStandalone(): boolean {
    return (
        (navigator as Navigator & { standalone?: boolean }).standalone ===
            true ||
        (typeof window.matchMedia === 'function' &&
            window.matchMedia('(display-mode: standalone)').matches)
    );
}

export function pushSupport(): PushSupport {
    if (isIos() && !isStandalone()) {
        return 'needs-install';
    }

    return 'serviceWorker' in navigator &&
        'PushManager' in window &&
        'Notification' in window
        ? 'supported'
        : 'unsupported';
}

function permission(): NotificationPermission {
    return 'Notification' in window ? Notification.permission : 'default';
}

/** The registration, if the service worker is installed (never in dev). */
async function registration(): Promise<ServiceWorkerRegistration | null> {
    return (await navigator.serviceWorker.getRegistration()) ?? null;
}

async function currentSubscription(): Promise<PushSubscription | null> {
    return (
        (await (await registration())?.pushManager.getSubscription()) ?? null
    );
}

export async function deviceState(): Promise<DeviceState> {
    const support = pushSupport();

    if (support !== 'supported') {
        return { support, permission: 'default', enabled: false };
    }

    const current = permission();

    return {
        support,
        permission: current,
        enabled:
            current === 'granted' && (await currentSubscription()) !== null,
    };
}

/** A VAPID public key (base64url) as `applicationServerKey` bytes. */
export function decodeServerKey(base64url: string): Uint8Array<ArrayBuffer> {
    const base64 = (base64url + '='.repeat((4 - (base64url.length % 4)) % 4))
        .replace(/-/g, '+')
        .replace(/_/g, '/');
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);

    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }

    return bytes;
}

function sameKey(subscription: PushSubscription, key: Uint8Array): boolean {
    const current = subscription.options.applicationServerKey;

    if (current === null) {
        return false;
    }

    const bytes = new Uint8Array(current);

    return bytes.length === key.length && bytes.every((b, i) => b === key[i]);
}

/**
 * This device's subscription for `vapidPublicKey`, and whether this call
 * made it. One made with another key (the server's keys changed) is
 * replaced: the server could not use it.
 */
async function subscribe(
    worker: ServiceWorkerRegistration,
    vapidPublicKey: string,
): Promise<{ subscription: PushSubscription; created: boolean }> {
    const key = decodeServerKey(vapidPublicKey);
    const existing = await worker.pushManager.getSubscription();

    if (existing && sameKey(existing, key)) {
        return { subscription: existing, created: false };
    }

    await existing?.unsubscribe();

    const subscription = await worker.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: key,
    });

    return { subscription, created: true };
}

function contentEncoding(): 'aes128gcm' | 'aesgcm' {
    const supported = (
        PushManager as { supportedContentEncodings?: readonly string[] }
    ).supportedContentEncodings;

    return !supported || supported.includes('aes128gcm')
        ? 'aes128gcm'
        : 'aesgcm';
}

function sendJson(
    route: { url: string; method: string },
    body: unknown,
): Promise<Response> {
    return send(route.url, {
        method: route.method.toUpperCase(),
        headers: { 'Content-Type': 'application/json', ...timeZoneHeader() },
        body: JSON.stringify(body),
    });
}

/**
 * Upserts the subscription on the server (endpoints rotate). Sends the time
 * zone too, like sync, so the first morning notification is on time.
 */
async function store(subscription: PushSubscription): Promise<void> {
    await sendJson(storeRoute(), {
        ...subscription.toJSON(),
        content_encoding: contentEncoding(),
    });
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(
            () => reject(new Error('The service worker is not ready.')),
            ms,
        );

        promise.then(
            (value) => {
                clearTimeout(timer);
                resolve(value);
            },
            (error: unknown) => {
                clearTimeout(timer);
                reject(error);
            },
        );
    });
}

/**
 * Turns notifications on here. Call it from a user gesture: it asks for the
 * permission first. Resolves `false` when the permission is not granted;
 * throws when subscribing or telling the server fails (then a subscription
 * this call made is dropped again).
 */
export async function enable(vapidPublicKey: string): Promise<boolean> {
    if ((await Notification.requestPermission()) !== 'granted') {
        return false;
    }

    const worker = await withTimeout(
        navigator.serviceWorker.ready,
        WORKER_READY_TIMEOUT_MS,
    );
    const { subscription, created } = await subscribe(worker, vapidPublicKey);

    try {
        await store(subscription);
    } catch (error) {
        if (created) {
            await subscription.unsubscribe();
        }

        throw error;
    }

    return true;
}

/**
 * Turns notifications off here. The browser unsubscribes first, so this
 * device stops getting pushes even offline; telling the server is best
 * effort (it also drops endpoints the push service reports gone).
 */
export async function disable(): Promise<void> {
    const subscription = await currentSubscription();

    if (!subscription) {
        return;
    }

    const { endpoint } = subscription;

    await subscription.unsubscribe();

    try {
        await sendJson(destroy(), { endpoint });
    } catch {
        // Offline or the server is down: the dead endpoint is pruned later.
    }
}

/**
 * Re-sends this device's subscription when the app starts (cheap upsert:
 * push services rotate endpoints, and the server's keys may have changed).
 * Background work: never throws, never awaited by the UI. Resolves false
 * when it could not reach the server (offline, `5xx`), so the caller can try
 * again; a refusal (`4xx`, e.g. no plan in SaaS mode) is final.
 */
export async function refreshSubscription(
    vapidPublicKey: string,
): Promise<boolean> {
    try {
        if (pushSupport() !== 'supported' || permission() !== 'granted') {
            return true;
        }

        const worker = await registration();

        if (!worker?.active || !(await worker.pushManager.getSubscription())) {
            return true;
        }

        await store((await subscribe(worker, vapidPublicKey)).subscription);

        return true;
    } catch (error) {
        return error instanceof SyncHttpError && error.status < 500;
    }
}

/**
 * Drops this browser's subscription without asking the server (signed out,
 * the session is gone): the next person on this device gets nothing meant
 * for the previous account. The push service then reports the endpoint gone
 * and the server forgets it.
 */
export async function forget(): Promise<void> {
    try {
        if (pushSupport() === 'supported') {
            await (await currentSubscription())?.unsubscribe();
        }
    } catch {
        // Nothing to drop.
    }
}
