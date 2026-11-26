// @vitest-environment happy-dom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { Toaster } from '@/components/ui/sonner';
import Integrations from './integrations';

const page = vi.hoisted(() => ({
    props: { integrations: { googleCalendar: false, icsFeed: true } } as Record<
        string,
        unknown
    >,
}));

const router = vi.hoisted(() => ({ post: vi.fn(), delete: vi.fn() }));

vi.mock('@inertiajs/react', () => ({
    Head: () => null,
    Link: ({
        children,
        href,
    }: {
        children: React.ReactNode;
        href: string | { url: string };
    }) => <a href={typeof href === 'string' ? href : href.url}>{children}</a>,
    usePage: () => page,
    router,
}));

const FEED_URL = 'https://plainweek.test/calendar/abc123.ics';

function renderPage(
    props: Partial<Parameters<typeof Integrations>[0]> = {},
): ReturnType<typeof userEvent.setup> {
    const user = userEvent.setup();

    render(
        <>
            <Integrations
                googleCalendar={null}
                icsFeed={null}
                canEnableIcsFeed
                {...props}
            />
            <Toaster />
        </>,
    );

    return user;
}

const feedCard = () =>
    document.querySelector<HTMLElement>('[data-test="ics-feed"]')!;

afterEach(() => {
    cleanup();
    router.post.mockReset();
    router.delete.mockReset();
    page.props = { integrations: { googleCalendar: false, icsFeed: true } };
});

describe('Settings › Integrations', () => {
    it('shows only the calendar feed when the instance has no Google keys', () => {
        renderPage();

        expect(document.querySelector('[data-test="google-calendar"]')).toBe(
            null,
        );
        expect(screen.getByText('Calendar feed')).toBeTruthy();
    });

    it('shows the Google Calendar card when the instance offers it', () => {
        page.props = { integrations: { googleCalendar: true, icsFeed: true } };
        renderPage();

        expect(
            document.querySelector('[data-test="google-calendar"]'),
        ).not.toBe(null);
        expect(feedCard()).toBeTruthy();
    });
});

describe('Calendar feed', () => {
    it('offers to enable the feed while it is off', async () => {
        const user = renderPage();

        expect(screen.queryByRole('textbox')).toBeNull();
        await user.click(screen.getByRole('button', { name: 'Enable' }));

        expect(router.post).toHaveBeenCalledOnce();
        expect(router.post.mock.calls[0][0]).toMatchObject({
            url: '/settings/integrations/ics',
            method: 'post',
        });
    });

    it('needs a plan to enable it in SaaS mode', () => {
        renderPage({ canEnableIcsFeed: false });

        expect(
            (
                screen.getByRole('button', {
                    name: 'Enable',
                }) as HTMLButtonElement
            ).disabled,
        ).toBe(true);
        expect(
            screen
                .getByRole('link', { name: 'choose a plan' })
                .getAttribute('href'),
        ).toBe('/plans');
    });

    it('shows the URL, a webcal link and the privacy warning while it is on', () => {
        renderPage({ icsFeed: { url: FEED_URL } });

        expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe(
            FEED_URL,
        );
        expect(
            screen
                .getByRole('link', { name: 'Open in Calendar app' })
                .getAttribute('href'),
        ).toBe('webcal://plainweek.test/calendar/abc123.ics');
        expect(screen.getByText(/Keep this link private/)).toBeTruthy();
    });

    it('copies the URL', async () => {
        const user = renderPage({ icsFeed: { url: FEED_URL } });

        await user.click(screen.getByRole('button', { name: 'Copy' }));

        expect(await navigator.clipboard.readText()).toBe(FEED_URL);
        expect(await screen.findByText('URL copied')).toBeTruthy();
    });

    it('asks before making a new URL', async () => {
        const user = renderPage({ icsFeed: { url: FEED_URL } });

        await user.click(
            screen.getByRole('button', { name: 'Regenerate URL' }),
        );
        const dialog = screen.getByRole('alertdialog');
        expect(within(dialog).getByText(/stops working at once/)).toBeTruthy();
        expect(router.post).not.toHaveBeenCalled();

        await user.click(
            within(dialog).getByRole('button', { name: 'Regenerate URL' }),
        );

        expect(router.post).toHaveBeenCalledOnce();
        expect(router.post.mock.calls[0][0]).toMatchObject({
            url: '/settings/integrations/ics',
        });
    });

    it('asks before disabling it', async () => {
        const user = renderPage({ icsFeed: { url: FEED_URL } });

        await user.click(screen.getByRole('button', { name: 'Disable' }));
        const dialog = screen.getByRole('alertdialog');

        await user.click(
            within(dialog).getByRole('button', { name: 'Disable' }),
        );

        expect(router.delete).toHaveBeenCalledOnce();
        expect(router.delete.mock.calls[0][0]).toMatchObject({
            url: '/settings/integrations/ics',
            method: 'delete',
        });
    });

    it('says calendars stopped updating without a plan and keeps only Disable', () => {
        renderPage({ icsFeed: { url: FEED_URL }, canEnableIcsFeed: false });

        expect(
            screen.getByText('Your calendars stopped updating'),
        ).toBeTruthy();
        expect(
            screen.queryByRole('button', { name: 'Regenerate URL' }),
        ).toBeNull();
        expect(screen.getByRole('button', { name: 'Disable' })).toBeTruthy();
    });

    it('lists how to subscribe from each app on demand', async () => {
        const user = renderPage({ icsFeed: { url: FEED_URL } });

        await user.click(
            screen.getByRole('button', { name: 'How to subscribe' }),
        );

        expect(screen.getByText('Apple Calendar')).toBeTruthy();
        expect(screen.getByText('Outlook')).toBeTruthy();
    });
});
