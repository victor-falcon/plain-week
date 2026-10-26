/**
 * The Web Push routes (docs/architecture.md, "Notifications (client)"), shaped like
 * Wayfinder's helpers so callers switch to `@/routes/notifications` with an
 * import change once those routes exist on every branch.
 */
function route<M extends 'get' | 'patch' | 'post' | 'delete'>(
    method: M,
    url: string,
) {
    const definition = (): { url: string; method: M } => ({ url, method });

    definition.url = () => url;
    definition.form = (): { action: string; method: M } => ({
        action: url,
        method,
    });

    return definition;
}

/** `GET` / `PATCH /settings/notifications`: Settings › Notifications. */
export const edit = route('get', '/settings/notifications');
export const update = route('patch', '/settings/notifications');

/** This device's push subscription: upsert (`POST`) or remove (`DELETE`). */
export const subscriptions = {
    store: route('post', '/notifications/subscriptions'),
    destroy: route('delete', '/notifications/subscriptions'),
};
