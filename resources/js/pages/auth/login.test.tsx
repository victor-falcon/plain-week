// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import Login from './login';

type Oidc = { enabled: boolean; only: boolean; label: string | null };

let pageProps: { oidc: Oidc; canRegister: boolean } = {
    oidc: { enabled: false, only: false, label: null },
    canRegister: true,
};

vi.mock('@inertiajs/react', () => ({
    Head: () => null,
    Link: ({
        children,
        href,
    }: {
        children: React.ReactNode;
        href: string | { url: string };
    }) => <a href={typeof href === 'string' ? href : href.url}>{children}</a>,
    router: { visit: vi.fn() },
    usePage: () => ({ props: { saas: { enabled: false }, ...pageProps } }),
    Form: ({
        children,
    }: {
        children: (state: {
            processing: boolean;
            errors: Record<string, string>;
        }) => React.ReactNode;
    }) => (
        <form aria-label="Log in">
            {children({ processing: false, errors: {} })}
        </form>
    ),
}));

vi.mock('@/components/passkey-verify', () => ({
    default: () => <button type="button">Sign in with passkey</button>,
}));

function renderPage(
    oidc: Partial<Oidc>,
    props: { oidcError?: string; canRegister?: boolean } = {},
) {
    pageProps = {
        oidc: { enabled: false, only: false, label: null, ...oidc },
        canRegister: props.canRegister ?? true,
    };
    render(<Login canResetPassword oidcError={props.oidcError} />);
}

describe('Login', () => {
    afterEach(cleanup);

    it('shows only the password form and passkey without single sign-on', () => {
        renderPage({});

        expect(screen.getByRole('form', { name: 'Log in' })).toBeTruthy();
        expect(screen.getByText('Sign in with passkey')).toBeTruthy();
        expect(screen.queryByRole('link', { name: /SSO/ })).toBeNull();
    });

    it('adds the IdP button, with the default label, above the form', () => {
        renderPage({ enabled: true });

        const button = screen.getByRole('link', { name: 'Log in with SSO' });
        expect(button.getAttribute('href')).toBe('/auth/oidc/redirect');
        expect(screen.getByRole('form', { name: 'Log in' })).toBeTruthy();
        expect(screen.getByLabelText('Password')).toBeTruthy();
    });

    it('uses the configured label', () => {
        renderPage({ enabled: true, label: 'Log in with Authentik' });

        expect(
            screen.getByRole('link', { name: 'Log in with Authentik' }),
        ).toBeTruthy();
    });

    it('offers only the IdP with OIDC_ONLY', () => {
        renderPage({ enabled: true, only: true }, { canRegister: false });

        expect(
            screen.getByRole('link', { name: 'Log in with SSO' }),
        ).toBeTruthy();
        expect(screen.queryByRole('form')).toBeNull();
        expect(screen.queryByLabelText('Password')).toBeNull();
        expect(screen.queryByText('Sign in with passkey')).toBeNull();
        expect(screen.queryByText('Forgot it?')).toBeNull();
        expect(screen.queryByText(/No account yet/)).toBeNull();
    });

    it('explains why the IdP login was refused', () => {
        renderPage({ enabled: true }, { oidcError: 'unverified_email' });

        expect(screen.getByRole('alert').textContent).toContain(
            'your identity provider has not verified the address',
        );
    });

    it('falls back to a generic message for an unknown reason', () => {
        renderPage({ enabled: true }, { oidcError: 'something_new' });

        expect(screen.getByRole('alert').textContent).toContain(
            'Single sign-on did not work',
        );
    });
});
