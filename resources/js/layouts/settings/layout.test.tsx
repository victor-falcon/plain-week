// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from 'vite-plus/test';
import SettingsLayout from './layout';

let props: Record<string, unknown> = {};
let currentPath = '/settings/profile';
const logout = vi.fn();

vi.mock('@inertiajs/react', () => ({
    Link: ({
        children,
        href,
        prefetch: _prefetch,
        ...rest
    }: {
        children: React.ReactNode;
        href: string | { url: string };
        prefetch?: boolean;
    }) => (
        <a href={typeof href === 'string' ? href : href.url} {...rest}>
            {children}
        </a>
    ),
    usePage: () => ({ props, url: currentPath }),
}));

vi.mock('@/hooks/use-current-url', () => ({
    useCurrentUrl: () => ({
        isCurrentOrParentUrl: (href: string | { url: string }) =>
            currentPath.startsWith(typeof href === 'string' ? href : href.url),
    }),
}));

vi.mock('@/hooks/use-logout', () => ({ useLogout: () => logout }));

const user = { id: 7, name: 'Ada Lovelace', email: 'ada@example.com' };

const renderLayout = () =>
    render(
        <SettingsLayout>
            <p>Profile form</p>
        </SettingsLayout>,
    );

beforeEach(() => {
    currentPath = '/settings/profile';
    logout.mockReset();
    props = {
        auth: { user },
        feedbackUrl: 'https://github.com/victor-falcon/plain-week/discussions',
        notifications: { enabled: false },
        integrations: { googleCalendar: false, icsFeed: true },
        mcp: { enabled: true },
        saas: { enabled: false },
    };
});

afterEach(cleanup);

describe('SettingsLayout', () => {
    it('links back to the planner at the top and at the end', () => {
        renderLayout();

        const backLinks = screen.getAllByRole('link', {
            name: 'Back to planner',
        });

        expect(backLinks).toHaveLength(2);
        backLinks.forEach((link) =>
            expect(link.getAttribute('href')).toBe('/'),
        );
        expect(screen.getByText('Profile form')).toBeTruthy();
    });

    it('lists the sections this instance offers and marks the current one', () => {
        renderLayout();

        const nav = screen.getByRole('navigation', { name: 'Settings' });
        const sections = Array.from(nav.querySelectorAll('a')).map(
            (link) => link.textContent,
        );

        expect(sections).toEqual([
            'Profile',
            'Security',
            'Appearance',
            'Preferences',
            'Labels',
            'Integrations',
            'Agents & apps',
            'Data',
        ]);
        expect(
            screen
                .getByRole('link', { name: 'Profile' })
                .getAttribute('aria-current'),
        ).toBe('page');
        expect(
            screen
                .getByRole('link', { name: 'Data' })
                .hasAttribute('aria-current'),
        ).toBe(false);
    });

    it('shows the sections of the features this instance turns on', () => {
        props = {
            ...props,
            notifications: { enabled: true },
            integrations: { googleCalendar: true, icsFeed: true },
            saas: { enabled: true },
        };
        renderLayout();

        const nav = screen.getByRole('navigation', { name: 'Settings' });

        expect(
            Array.from(nav.querySelectorAll('a')).map(
                (link) => link.textContent,
            ),
        ).toEqual([
            'Profile',
            'Security',
            'Appearance',
            'Preferences',
            'Labels',
            'Notifications',
            'Integrations',
            'Agents & apps',
            'Data',
            'Billing',
        ]);
    });

    it('hides Integrations when the instance offers none', () => {
        props = {
            ...props,
            integrations: { googleCalendar: false, icsFeed: false },
        };
        renderLayout();

        expect(screen.queryByRole('link', { name: 'Integrations' })).toBeNull();
    });

    it('has no log out without a signed-in user', () => {
        props = { ...props, auth: { user: null } };
        renderLayout();

        expect(screen.queryByRole('button', { name: 'Log out' })).toBeNull();
    });

    it('keeps feedback, the project links and log out in the footer', () => {
        renderLayout();

        expect(
            screen
                .getByRole('link', { name: 'Send feedback' })
                .getAttribute('target'),
        ).toBe('_blank');
        expect(screen.getByRole('link', { name: 'Repository' })).toBeTruthy();
        expect(
            screen.getByRole('link', { name: 'Documentation' }),
        ).toBeTruthy();

        fireEvent.click(screen.getByRole('button', { name: 'Log out' }));

        expect(logout).toHaveBeenCalledOnce();
    });

    it('leaves out feedback when the page has no feedback URL', () => {
        props.feedbackUrl = '';
        renderLayout();

        expect(
            screen.queryByRole('link', { name: 'Send feedback' }),
        ).toBeNull();
    });
});
