// @vitest-environment happy-dom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { TooltipProvider } from '@/components/ui/tooltip';
import Agents from './agents';

const page = vi.hoisted(() => ({
    props: { account: { hasAccess: true, plan: null } } as Record<
        string,
        unknown
    >,
    flash: {} as Record<string, unknown>,
}));

vi.mock('@inertiajs/react', () => ({
    Head: () => null,
    Link: ({
        children,
        href,
    }: {
        children: React.ReactNode;
        href: unknown;
    }) => <a href={typeof href === 'string' ? href : '#'}>{children}</a>,
    usePage: () => page,
    router: { delete: vi.fn() },
    Form: ({
        children,
    }: {
        children: (state: {
            processing: boolean;
            errors: Record<string, string>;
        }) => React.ReactNode;
    }) => <form>{children({ processing: false, errors: {} })}</form>,
}));

const URL = 'https://plainweek.test/mcp';

function renderPage(
    props: Partial<Parameters<typeof Agents>[0]> = {},
): ReturnType<typeof userEvent.setup> {
    const user = userEvent.setup();

    render(
        <TooltipProvider>
            <Agents
                mcpUrl={URL}
                personalTokens={[]}
                oauthApps={[]}
                activity={{
                    entries: [],
                    previousPageUrl: null,
                    nextPageUrl: null,
                }}
                {...props}
            />
        </TooltipProvider>,
    );

    return user;
}

afterEach(() => {
    cleanup();
    page.props = { account: { hasAccess: true, plan: null } };
    page.flash = {};
});

describe('Settings › Agents', () => {
    it('shows the MCP URL with a copy button and empty lists', () => {
        renderPage();

        expect(
            screen.getByText(URL, { selector: '[data-test="agents-mcp-url"]' }),
        ).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Copy URL' })).toBeTruthy();
        expect(screen.getByText('No personal tokens yet.')).toBeTruthy();
        expect(screen.getByText('No apps connected yet.')).toBeTruthy();
        expect(screen.queryByText('Agents need a paid plan')).toBeNull();
    });

    it('shows a new token once and fills it into the Claude Code command', async () => {
        page.flash = { newToken: { name: 'Laptop', token: 'secret-token' } };
        const user = renderPage();

        expect(
            screen.getByText('secret-token', {
                selector: '[data-test="agents-new-token-value"]',
            }),
        ).toBeTruthy();

        await user.click(screen.getByRole('tab', { name: 'Claude Code' }));

        expect(
            screen.getByText(
                `claude mcp add --transport http plain-week ${URL} --header "Authorization: Bearer secret-token"`,
            ),
        ).toBeTruthy();
    });

    it('uses a placeholder in the snippets without a new token', async () => {
        const user = renderPage();

        await user.click(screen.getByRole('tab', { name: 'Other clients' }));

        expect(
            screen.getByText(/"Authorization": "Bearer <your token>"/),
        ).toBeTruthy();
    });

    it('lists tokens and apps with a revoke action', () => {
        renderPage({
            personalTokens: [
                {
                    id: 't1',
                    name: 'Laptop',
                    createdAt: '2026-11-19T10:00:00Z',
                    lastUsedAt: null,
                },
            ],
            oauthApps: [
                {
                    id: 'c1',
                    name: 'Claude',
                    createdAt: '2026-11-19T10:00:00Z',
                    lastUsedAt: '2026-11-20T10:00:00Z',
                },
            ],
        });

        const tokens = document.querySelector(
            '[data-test="agents-token-list"]',
        ) as HTMLElement;
        expect(within(tokens).getByText('Laptop')).toBeTruthy();
        expect(within(tokens).getByText(/Never used/)).toBeTruthy();
        expect(
            within(tokens).getByRole('button', { name: 'Revoke' }),
        ).toBeTruthy();

        const apps = document.querySelector(
            '[data-test="agents-app-list"]',
        ) as HTMLElement;
        expect(within(apps).getByText('Claude')).toBeTruthy();
        expect(within(apps).getByText(/Last used/)).toBeTruthy();
        expect(
            within(apps).getByRole('button', { name: 'Disconnect' }),
        ).toBeTruthy();
    });

    it('says no agent changed anything yet', () => {
        renderPage();

        expect(screen.getByText('No changes by agents yet.')).toBeTruthy();
        expect(
            screen.queryByRole('navigation', { name: 'Activity pages' }),
        ).toBeNull();
    });

    it('lists the activity with its client and tool, and pages through it', () => {
        renderPage({
            activity: {
                entries: [
                    {
                        id: 2,
                        tool: 'create_tasks',
                        summary: 'Created 3 tasks on Mon 23 Nov',
                        clientType: 'token',
                        clientName: 'Laptop',
                        createdAt: '2026-11-20T10:00:00Z',
                    },
                ],
                previousPageUrl: null,
                nextPageUrl: '/settings/agents?activity_page=2',
            },
        });

        const list = document.querySelector(
            '[data-test="agents-activity-list"]',
        ) as HTMLElement;
        expect(
            within(list).getByText('Created 3 tasks on Mon 23 Nov'),
        ).toBeTruthy();
        expect(within(list).getByText('Laptop')).toBeTruthy();
        expect(within(list).getByText('create_tasks')).toBeTruthy();
        expect(
            (screen.getByRole('button', { name: /Newer/ }) as HTMLButtonElement)
                .disabled,
        ).toBe(true);
        expect(
            screen.getByRole('link', { name: /Older/ }).getAttribute('href'),
        ).toBe('/settings/agents?activity_page=2');
    });

    it('says a plan is needed in SaaS mode without one', () => {
        page.props = { account: { hasAccess: false, plan: null } };
        renderPage();

        expect(screen.getByText('Agents need a paid plan')).toBeTruthy();
    });
});
