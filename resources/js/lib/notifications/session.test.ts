import { describe, expect, it, vi } from 'vite-plus/test';
import { createSessionSubscriptionSync } from '@/lib/notifications/session';

const notifications = { enabled: true, vapidPublicKey: 'key' };

function setup(refreshResult = true) {
    const refresh = vi.fn(() => Promise.resolve(refreshResult));
    const drop = vi.fn(() => Promise.resolve());

    return {
        refresh,
        drop,
        sync: createSessionSubscriptionSync(refresh, drop),
    };
}

const signedIn = (id: number) => ({
    auth: { user: { id } as never },
    notifications,
});

describe('createSessionSubscriptionSync', () => {
    it('re-sends the subscription once per signed-in user', () => {
        const { refresh, drop, sync } = setup();

        sync(signedIn(7));
        sync(signedIn(7));

        expect(refresh).toHaveBeenCalledTimes(1);
        expect(refresh).toHaveBeenCalledWith('key');
        expect(drop).not.toHaveBeenCalled();
    });

    it('does nothing when the instance has no Web Push', () => {
        const { refresh, sync } = setup();

        sync({
            auth: { user: { id: 7 } as never },
            notifications: { enabled: false, vapidPublicKey: null },
        });
        sync({ auth: { user: { id: 8 } as never } });

        expect(refresh).not.toHaveBeenCalled();
    });

    it('drops the subscription when signed out, once', () => {
        const { refresh, drop, sync } = setup();

        sync(signedIn(7));
        sync({ auth: { user: null as never }, notifications });
        sync({ auth: null, notifications });

        expect(drop).toHaveBeenCalledTimes(1);

        sync(signedIn(8));
        expect(refresh).toHaveBeenCalledTimes(2);
    });

    it('tries again on the next page when the server could not be reached', async () => {
        const { refresh, sync } = setup(false);

        sync(signedIn(7));
        await Promise.resolve();
        await Promise.resolve();
        sync(signedIn(7));

        expect(refresh).toHaveBeenCalledTimes(2);
    });
});
