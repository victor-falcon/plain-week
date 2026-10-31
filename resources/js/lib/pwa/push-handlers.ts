/**
 * The service worker's Web Push handlers (docs/architecture.md, "Offline app
 * shell"), kept apart from `sw.ts` so they can be tested without a worker.
 */

/** What the server sends in a push (the Web Push contract). */
export type PushPayload = {
    title: string;
    body: string;
    /** Same-origin path to open: `/?task=<occurrence id>`, or `/` for a morning summary of several tasks. */
    url: string;
    /** Replaces an earlier notification with the same tag. */
    tag: string;
};

export const NOTIFICATION_ICON = '/pwa-192x192.png';
export const NOTIFICATION_BADGE = '/notification-badge.png';

/** Opened when a notification carries no usable URL. */
const FALLBACK_URL = '/';

/**
 * Reads a push message's JSON. Anything malformed still yields a notification
 * (a push with `userVisibleOnly` must show one), pointing at the planner.
 */
export function parsePushPayload(
    data: { json(): unknown } | null,
): PushPayload {
    let raw: Partial<Record<keyof PushPayload, unknown>> = {};

    try {
        const parsed = data?.json();

        if (typeof parsed === 'object' && parsed !== null) {
            raw = parsed;
        }
    } catch {
        // Not JSON: fall back to the defaults below.
    }

    const text = (value: unknown, fallback: string) =>
        typeof value === 'string' && value !== '' ? value : fallback;

    return {
        title: text(raw.title, 'Plain Week'),
        body: text(raw.body, ''),
        url: text(raw.url, FALLBACK_URL),
        tag: text(raw.tag, ''),
    };
}

/** `showNotification`'s arguments for a payload. */
export function notificationFor(
    payload: PushPayload,
): [string, NotificationOptions] {
    return [
        payload.title,
        {
            body: payload.body,
            ...(payload.tag ? { tag: payload.tag } : {}),
            data: { url: payload.url },
            icon: NOTIFICATION_ICON,
            badge: NOTIFICATION_BADGE,
        },
    ];
}

/**
 * The absolute URL a notification opens. Only same-origin URLs are followed;
 * anything else opens the planner.
 */
export function notificationUrl(data: unknown, origin: string): string {
    const url = (data as { url?: unknown } | null)?.url;

    if (typeof url === 'string') {
        try {
            const resolved = new URL(url, origin);

            if (resolved.origin === origin) {
                return resolved.href;
            }
        } catch {
            // Not a URL: fall through.
        }
    }

    return new URL(FALLBACK_URL, origin).href;
}

/** The part of `Clients` the click handler needs. */
export type WindowClients = {
    matchAll(options: {
        type: 'window';
        includeUncontrolled: boolean;
    }): Promise<readonly WindowClientLike[]>;
    openWindow(url: string): Promise<unknown>;
};

export type WindowClientLike = {
    url: string;
    focused: boolean;
    visibilityState: DocumentVisibilityState;
    focus(): Promise<unknown>;
    navigate(url: string): Promise<unknown>;
};

/** The window to reuse: the focused one, else a visible one, else any. */
function pickWindow(
    windows: readonly WindowClientLike[],
    origin: string,
): WindowClientLike | undefined {
    const ours = windows.filter(
        (client) => new URL(client.url).origin === origin,
    );

    return (
        ours.find((client) => client.focused) ??
        ours.find((client) => client.visibilityState === 'visible') ??
        ours[0]
    );
}

/**
 * Brings Plain Week to `url`: loads it in an open window of this origin
 * (a full load, so the task link opens its dialog) and focuses that window,
 * or opens a new window when there is none or it can't be navigated.
 */
export async function openNotificationUrl(
    clients: WindowClients,
    url: string,
    origin: string,
): Promise<void> {
    const existing = pickWindow(
        await clients.matchAll({ type: 'window', includeUncontrolled: true }),
        origin,
    );

    if (existing) {
        try {
            await existing.navigate(url);
        } catch {
            // Not controlled by this worker, or gone meanwhile.
            await clients.openWindow(url);

            return;
        }

        // The window may refuse focus; it already shows the task.
        await existing.focus().catch(() => undefined);

        return;
    }

    await clients.openWindow(url);
}
