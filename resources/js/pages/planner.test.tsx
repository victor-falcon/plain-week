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
import { landingStore } from '@/lib/landing';
import Planner from './planner';

let props: {
    auth: { user: { id: number } | null };
    saas: { enabled: boolean };
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
        href: string;
        onClick?: () => void;
    }) => (
        <a
            href={href}
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

/** Node's own `localStorage` (unset without `--localstorage-file`) hides happy-dom's. */
function memoryStorage(): Storage {
    const items = new Map<string, string>();

    return {
        get length() {
            return items.size;
        },
        clear: () => items.clear(),
        getItem: (key) => items.get(key) ?? null,
        key: (index) => [...items.keys()][index] ?? null,
        removeItem: (key) => void items.delete(key),
        setItem: (key, value) => void items.set(key, String(value)),
    };
}

beforeEach(() => {
    props = { auth: { user: null }, saas: { enabled: true } };
    vi.stubGlobal('localStorage', memoryStorage());
    sessionStorage.clear();
    act(() => landingStore.reopen());
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
