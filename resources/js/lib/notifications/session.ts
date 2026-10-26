import { router } from '@inertiajs/react';
import { forget, refreshSubscription } from '@/lib/notifications/device';
import type { Auth, Notifications } from '@/types';

type SessionProps = {
    auth?: Partial<Auth> | null;
    notifications?: Notifications | null;
};

/**
 * Keeps this device's push subscription in step with the session, from the
 * Inertia page props (in the background; the first page renders without
 * waiting):
 *
 * - Signed in on an instance with Web Push: re-sends the subscription once
 *   per user and page load (endpoints rotate), again on the next page if
 *   the server could not be reached.
 * - Signed out (a logout here or in another tab, an expired session): drops
 *   it, so whoever signs in next on this device never inherits it.
 */
export function createSessionSubscriptionSync(
    refresh = refreshSubscription,
    drop = forget,
): (props: SessionProps) => void {
    // undefined: nothing seen yet; null: signed out.
    let handled: number | null | undefined;

    return ({ auth, notifications }) => {
        const userId = auth?.user?.id ?? null;

        if (userId === handled) {
            return;
        }

        handled = userId;

        if (userId === null) {
            void drop();

            return;
        }

        const key = notifications?.enabled
            ? notifications.vapidPublicKey
            : null;

        if (key !== null) {
            void refresh(key).then((done) => {
                if (!done && handled === userId) {
                    handled = undefined;
                }
            });
        }
    };
}

export function syncSubscriptionWithSession(): void {
    const sync = createSessionSubscriptionSync();

    // `navigate` covers the first page and history; `success` also covers
    // same-URL visits, such as the logout's visit to `/` from the planner.
    router.on('navigate', (event) => sync(event.detail.page.props));
    router.on('success', (event) => sync(event.detail.page.props));
}
