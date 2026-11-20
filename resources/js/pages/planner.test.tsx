// @vitest-environment happy-dom
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from 'vite-plus/test';
import type { Offers } from '@/components/billing/offers';
import { InstallAppDialog } from '@/components/install-app/install-app-card';
import { installAppStore } from '@/lib/install-app';
import { landingStore } from '@/lib/landing';
import { mcpAnnouncementStore } from '@/lib/mcp-announcement';
import { memoryStorage } from '@/test/storage';
import Planner from './planner';

let props: {
    auth: { user: { id: number } | null };
    saas: { enabled: boolean };
    mcp: { enabled: boolean };
    account: { hasAccess: boolean; plan: string | null } | null;
};

vi.mock('@inertiajs/react', () => ({
    Head: () => null,
    Link: ({
        children,
        href,
        onClick,
        ...rest
    }: {
        children: React.ReactNode;
        href: string | { url: string };
        onClick?: () => void;
    }) => (
        <a
            href={typeof href === 'string' ? href : href.url}
            {...rest}
            onClick={(event) => {
                event.preventDefault();
                onClick?.();
            }}
        >
            {children}
        </a>
    ),
    usePage: () => ({ props }),
}));

const offers: Offers = {
    weekly: { price: '€2.99' },
    lifetime: { price: '€16', regularPrice: '€64', discountPercent: 75 },
};

beforeEach(() => {
    props = {
        auth: { user: null },
        saas: { enabled: true },
        mcp: { enabled: false },
        account: null,
    };
    vi.stubGlobal('localStorage', memoryStorage());
    sessionStorage.clear();
    act(() => landingStore.reopen());
    act(() => installAppStore.reset());
    act(() => mcpAnnouncementStore.reset());
    vi.stubGlobal(
        'fetch',
        vi.fn(() =>
            Promise.resolve(
                new Response(JSON.stringify({ plans: offers }), {
                    status: 200,
                }),
            ),
        ),
    );
});

afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
});

const landing = () =>
    screen.queryByRole('dialog', { name: /feels like paper/ });

describe('Planner landing card', () => {
    it('floats over a guest planner in SaaS mode with the prices from the server', async () => {
        render(<Planner />);

        expect(landing()).not.toBeNull();
        expect(await screen.findByText('€2.99')).not.toBeNull();
        expect(screen.queryByText('€16')).not.toBeNull();
        expect(screen.queryByText('€64')).not.toBeNull();
        expect(screen.queryByText('Launch −75%')).not.toBeNull();
        expect(document.activeElement?.textContent).toBe('Start now');
    });

    it('stays closed on this device after Start now', async () => {
        const user = userEvent.setup();

        render(<Planner />);
        await user.click(screen.getByRole('button', { name: 'Start now' }));

        expect(landing()).toBeNull();
        expect(
            window.localStorage.getItem('plain-week.landing-dismissed'),
        ).toBe('1');
    });

    it('closes with Escape like Start now', async () => {
        const user = userEvent.setup();

        render(<Planner />);
        await user.keyboard('{Escape}');

        expect(landing()).toBeNull();
        expect(landingStore.isDismissed()).toBe(true);
    });

    it('remembers the plan picked for the plan choice after sign-up', async () => {
        const user = userEvent.setup();

        render(<Planner />);
        await user.click(screen.getByRole('link', { name: 'Choose weekly' }));

        expect(sessionStorage.getItem('plain-week.chosen-plan')).toBe('weekly');
    });

    it('opens the FAQ answers from the keyboard', async () => {
        const user = userEvent.setup();

        render(<Planner />);
        const question = screen.getByRole('button', {
            name: 'Is there a free trial?',
        });

        question.focus();
        await user.keyboard('{Enter}');

        expect(question.getAttribute('aria-expanded')).toBe('true');
        expect(
            screen.queryByText(/The browser version is free forever/),
        ).not.toBeNull();
    });

    it('points self-hosters to the guide with a single link', () => {
        render(<Planner />);
        const block = document.getElementById('self-hosting')!;
        const links = within(block).getAllByRole('link');

        expect(links).toHaveLength(1);
        expect(links[0].getAttribute('href')).toBe(
            'https://github.com/victor-falcon/plain-week/blob/main/docs/self-hosting.md',
        );
        expect(links[0].getAttribute('target')).toBe('_blank');
        expect(links[0].textContent).toContain('Self-hosting guide');
        expect(block.querySelector('pre')).toBeNull();
    });

    it('says where to find the prices when they cannot be loaded', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(() => Promise.reject(new TypeError('offline'))),
        );
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        render(<Planner />);

        expect(
            (await screen.findAllByText('Price shown at sign-up')).length,
        ).toBe(2);
    });

    it('shows again from the guest menu until the next load', () => {
        act(() => landingStore.dismiss());
        act(() => landingStore.reopen());

        expect(landingStore.isDismissed()).toBe(false);
        expect(
            window.localStorage.getItem('plain-week.landing-dismissed'),
        ).toBe('1');
    });

    it('is never shown to signed-in users', () => {
        props.auth.user = { id: 7 };
        render(<Planner />);

        expect(landing()).toBeNull();
    });

    it('is never shown on a self-hosted instance', () => {
        props.saas.enabled = false;
        render(<Planner />);

        expect(landing()).toBeNull();
    });
});

/** A desktop browser (wide, with a mouse) unless `desktop` is false. */
function stubScreen(desktop: boolean) {
    vi.stubGlobal(
        'matchMedia',
        vi.fn((query: string) => ({
            matches: query.includes('display-mode') ? false : desktop,
        })),
    );
}

const installCard = () =>
    screen.queryByRole('dialog', { name: 'Plain Week on your phone' });

function renderPlanner() {
    return render(
        <>
            <Planner />
            <InstallAppDialog />
        </>,
    );
}

/** Moves the test page to `url` (happy-dom starts on localhost). */
function setUrl(url: string) {
    (
        window as unknown as { happyDOM: { setURL: (url: string) => void } }
    ).happyDOM.setURL(url);
}

describe('Install mobile app card', () => {
    beforeEach(() => {
        props.saas.enabled = false;
        stubScreen(true);
        setUrl('https://plainweek.example/');
    });

    afterEach(() => setUrl('http://localhost:3000/'));

    it('opens once by itself on a desktop, with a QR code to this planner', () => {
        renderPlanner();

        expect(installCard()).not.toBeNull();
        expect(
            screen.getByRole('img', {
                name: `QR code for ${window.location.origin}/`,
            }),
        ).not.toBeNull();
        expect(screen.queryByText('Add to Home Screen')).not.toBeNull();
        expect(screen.queryByText('Install app')).not.toBeNull();
        expect(document.activeElement?.textContent).toBe('Got it');
    });

    it('never opens by itself again once closed', async () => {
        const user = userEvent.setup();
        const { unmount } = renderPlanner();

        await user.click(screen.getByRole('button', { name: 'Got it' }));

        expect(installCard()).toBeNull();
        expect(window.localStorage.getItem('plain-week.install-app-seen')).toBe(
            '1',
        );

        unmount();
        renderPlanner();

        expect(installCard()).toBeNull();
    });

    it('is remembered when closed with Escape', async () => {
        const user = userEvent.setup();

        renderPlanner();
        await user.keyboard('{Escape}');

        expect(installCard()).toBeNull();
        expect(window.localStorage.getItem('plain-week.install-app-seen')).toBe(
            '1',
        );
    });

    it('does not open by itself on a phone', () => {
        stubScreen(false);
        renderPlanner();

        expect(installCard()).toBeNull();
    });

    it('waits for the next visit when the landing card was shown', async () => {
        const user = userEvent.setup();

        props.saas.enabled = true;
        renderPlanner();
        await user.click(screen.getByRole('button', { name: 'Start now' }));

        expect(landing()).toBeNull();
        expect(installCard()).toBeNull();
    });

    it('opens from the header button even after it was seen', () => {
        window.localStorage.setItem('plain-week.install-app-seen', '1');
        act(() => installAppStore.reset());
        renderPlanner();

        expect(installCard()).toBeNull();

        act(() => installAppStore.open());

        expect(installCard()).not.toBeNull();
    });

    it('still waits after the planner page remounts in the same load', async () => {
        const user = userEvent.setup();

        props.saas.enabled = true;
        const { unmount } = renderPlanner();

        await user.click(screen.getByRole('button', { name: 'Start now' }));
        // A visit to /login and back: the page remounts, the layout does not.
        unmount();
        renderPlanner();

        expect(landing()).toBeNull();
        expect(installCard()).toBeNull();
    });

    it('does not open over a task opened from a link', () => {
        setUrl('https://plainweek.example/?task=abc');
        renderPlanner();

        expect(installCard()).toBeNull();
        expect(window.localStorage.getItem('plain-week.install-app-seen')).toBe(
            null,
        );
    });

    it('does not open by itself on localhost, where a phone cannot reach it', () => {
        setUrl('http://localhost:8000/');
        renderPlanner();

        expect(installCard()).toBeNull();
    });
});

const announcement = () =>
    screen.queryByRole('dialog', { name: 'Your AI agent can plan your week' });

describe('MCP announcement card', () => {
    beforeEach(() => {
        props.auth.user = { id: 7 };
        props.mcp.enabled = true;
        props.account = { hasAccess: true, plan: 'lifetime' };
        stubScreen(true);
        setUrl('https://plainweek.example/');
    });

    afterEach(() => setUrl('http://localhost:3000/'));

    it('opens once for a signed-in user, pointing at Settings › Agents & apps', () => {
        renderPlanner();

        expect(announcement()).not.toBeNull();
        expect(screen.queryByText('New')).not.toBeNull();
        expect(
            screen.queryByText('“Move everything unfinished to Friday.”'),
        ).not.toBeNull();
        expect(
            screen.queryByText('Set it up in Settings › Agents & apps.'),
        ).not.toBeNull();

        const connect = screen.getByRole('link', { name: 'Connect an agent' });

        expect(connect.getAttribute('href')).toBe('/settings/agents');
        expect(document.activeElement).toBe(connect);
    });

    it('never opens again once closed with Not now', async () => {
        const user = userEvent.setup();
        const { unmount } = renderPlanner();

        await user.click(screen.getByRole('button', { name: 'Not now' }));

        expect(announcement()).toBeNull();
        expect(
            window.localStorage.getItem('plain-week.mcp-announcement-seen'),
        ).toBe('1');

        unmount();
        act(() => mcpAnnouncementStore.reset());
        renderPlanner();

        expect(announcement()).toBeNull();
    });

    it('is remembered when closed with Escape or the connect button', async () => {
        const user = userEvent.setup();

        renderPlanner();
        await user.keyboard('{Escape}');

        expect(announcement()).toBeNull();
        expect(
            window.localStorage.getItem('plain-week.mcp-announcement-seen'),
        ).toBe('1');

        cleanup();
        window.localStorage.clear();
        act(() => mcpAnnouncementStore.reset());
        renderPlanner();
        await user.click(
            screen.getByRole('link', { name: 'Connect an agent' }),
        );

        expect(announcement()).toBeNull();
        expect(
            window.localStorage.getItem('plain-week.mcp-announcement-seen'),
        ).toBe('1');
    });

    it('sends a SaaS user without a plan to the plans', () => {
        props.account = { hasAccess: false, plan: null };
        renderPlanner();

        expect(
            screen.queryByText(/It comes with the sync plan/),
        ).not.toBeNull();
        expect(
            screen
                .getByRole('link', { name: 'See plans' })
                .getAttribute('href'),
        ).toBe('/plans');
        expect(
            screen.queryByRole('link', { name: 'Connect an agent' }),
        ).toBeNull();
    });

    it('is never shown to guests', () => {
        props.auth.user = null;
        props.saas.enabled = false;
        renderPlanner();

        expect(announcement()).toBeNull();
    });

    it('is never shown when the instance has the MCP server off', () => {
        props.mcp.enabled = false;
        renderPlanner();

        expect(announcement()).toBeNull();
        // Its turn passes to the install card.
        expect(installCard()).not.toBeNull();
    });

    it('opens before the install card, which waits for the next load', async () => {
        const user = userEvent.setup();
        const { unmount } = renderPlanner();

        expect(announcement()).not.toBeNull();
        expect(installCard()).toBeNull();

        await user.click(screen.getByRole('button', { name: 'Not now' }));
        // Same load: the planner page remounts (a visit to /login and back).
        unmount();
        renderPlanner();

        expect(announcement()).toBeNull();
        expect(installCard()).toBeNull();
        expect(window.localStorage.getItem('plain-week.install-app-seen')).toBe(
            null,
        );
    });

    it('lets the install card open on a later load once seen', () => {
        window.localStorage.setItem('plain-week.mcp-announcement-seen', '1');
        act(() => mcpAnnouncementStore.reset());
        renderPlanner();

        expect(announcement()).toBeNull();
        expect(installCard()).not.toBeNull();
    });

    it('waits for the next load when the landing card was shown in this one', async () => {
        const user = userEvent.setup();

        props.auth.user = null;
        const { unmount } = renderPlanner();

        await user.click(screen.getByRole('button', { name: 'Start now' }));
        // The guest logs in: the planner page remounts in the same load.
        unmount();
        props.auth.user = { id: 7 };
        renderPlanner();

        expect(announcement()).toBeNull();
        expect(installCard()).toBeNull();
        expect(
            window.localStorage.getItem('plain-week.mcp-announcement-seen'),
        ).toBe(null);
    });

    it('does not open over a task opened from a link', () => {
        setUrl('https://plainweek.example/?task=abc');
        renderPlanner();

        expect(announcement()).toBeNull();
        expect(
            window.localStorage.getItem('plain-week.mcp-announcement-seen'),
        ).toBe(null);
    });
});
