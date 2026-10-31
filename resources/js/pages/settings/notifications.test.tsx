// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { Toaster } from '@/components/ui/sonner';
import {
    VAPID_KEY,
    installFakePush,
    uninstallFakePush,
} from '@/test/fake-push';
import Notifications from './notifications';

vi.mock('@inertiajs/react', () => ({
    Head: () => null,
    usePage: () => ({
        props: {
            notifications: { enabled: true, vapidPublicKey: VAPID_KEY },
        },
    }),
    Form: ({
        children,
        action,
        method,
    }: {
        children: (state: {
            processing: boolean;
            recentlySuccessful: boolean;
            errors: Record<string, string>;
        }) => React.ReactNode;
        action: string;
        method: string;
    }) => (
        <form data-action={action} data-method={method}>
            {children({
                processing: false,
                recentlySuccessful: false,
                errors: {},
            })}
        </form>
    ),
}));

function renderPage(timezone: string | null = 'Europe/Madrid') {
    const user = userEvent.setup();

    render(
        <>
            <Notifications morningTime="07:30" timezone={timezone} />
            <Toaster />
        </>,
    );

    return user;
}

function deviceSwitch() {
    return screen.getByRole('switch', {
        name: 'Notifications on this device',
    });
}

afterEach(() => {
    cleanup();
    uninstallFakePush();
    vi.restoreAllMocks();
});

describe('Settings › Notifications', () => {
    it('explains what is sent and shows the morning time and time zone', () => {
        installFakePush();
        renderPage();

        expect(
            screen.getByText(
                /one notification with the day's tasks\s+that have no time/,
            ),
        ).toBeTruthy();
        expect(screen.getByText(/5 minutes before/)).toBeTruthy();
        expect(
            (screen.getByLabelText('Morning notifications') as HTMLInputElement)
                .value,
        ).toBe('07:30');
        expect(
            screen.getByText(/In your time zone, Europe\/Madrid/),
        ).toBeTruthy();

        const form = document.querySelector('form');
        expect(form?.dataset.action).toBe(
            '/settings/notifications?_method=PATCH',
        );
        expect(form?.dataset.method).toBe('post');
    });

    it('says when the time zone is not known yet', () => {
        installFakePush();
        renderPage(null);

        expect(
            screen.getByText(/once one of your devices has synced/),
        ).toBeTruthy();
    });

    it('turns notifications on for this device', async () => {
        const fake = installFakePush();
        const user = renderPage();

        await waitFor(() =>
            expect(deviceSwitch().hasAttribute('disabled')).toBe(false),
        );
        expect(deviceSwitch().getAttribute('aria-checked')).toBe('false');

        await user.click(deviceSwitch());

        await screen.findByText('Notifications are on for this device.');
        await waitFor(() =>
            expect(deviceSwitch().getAttribute('aria-checked')).toBe('true'),
        );
        expect(fake.subscription).not.toBeNull();
    });

    it('turns notifications off for this device', async () => {
        const fake = installFakePush({
            permission: 'granted',
            subscribed: true,
        });
        const user = renderPage();

        await waitFor(() =>
            expect(deviceSwitch().getAttribute('aria-checked')).toBe('true'),
        );

        await user.click(deviceSwitch());

        await screen.findByText('Notifications are off for this device.');
        await waitFor(() =>
            expect(deviceSwitch().getAttribute('aria-checked')).toBe('false'),
        );
        expect(fake.subscription).toBeNull();
    });

    it('stays off and says so when the server answers with an error', async () => {
        const fake = installFakePush();
        fake.status = 500;
        const user = renderPage();

        await waitFor(() =>
            expect(deviceSwitch().hasAttribute('disabled')).toBe(false),
        );
        await user.click(deviceSwitch());

        await screen.findByText(/Reload the page and try again/);
        expect(deviceSwitch().getAttribute('aria-checked')).toBe('false');
        expect(fake.subscription).toBeNull();
    });

    it('stays off and says so offline', async () => {
        const fake = installFakePush();
        fake.offline = true;
        vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
        const user = renderPage();

        await waitFor(() =>
            expect(deviceSwitch().hasAttribute('disabled')).toBe(false),
        );
        await user.click(deviceSwitch());

        await screen.findByText(/You're offline/);
        expect(deviceSwitch().getAttribute('aria-checked')).toBe('false');
    });

    it('explains how to unblock notifications', async () => {
        installFakePush({ permission: 'denied' });
        renderPage();

        await screen.findByText('Notifications are blocked');
        expect(deviceSwitch().hasAttribute('disabled')).toBe(true);
    });

    it('turns blocked when the permission prompt is refused', async () => {
        const fake = installFakePush();
        fake.promptAnswer = 'denied';
        const user = renderPage();

        await waitFor(() =>
            expect(deviceSwitch().hasAttribute('disabled')).toBe(false),
        );
        await user.click(deviceSwitch());

        await screen.findByText('Notifications are blocked');
        expect(fake.subscribe).not.toHaveBeenCalled();
    });

    it('says when this browser has no Web Push', async () => {
        renderPage();

        await screen.findByText('Not available in this browser');
        expect(deviceSwitch().hasAttribute('disabled')).toBe(true);
    });

    it('asks iOS Safari users to add the app to the Home Screen', async () => {
        vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(
            'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
        );
        renderPage();

        await screen.findByText('Add Plain Week to your Home Screen');
        expect(deviceSwitch().hasAttribute('disabled')).toBe(true);
    });
});
