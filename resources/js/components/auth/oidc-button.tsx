import { usePage } from '@inertiajs/react';
import { LogIn } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { TextKey } from '@/lib/i18n';
import { t } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { redirect } from '@/routes/oidc';

type Props = {
    /** Re-authenticate the signed-in account at the IdP instead of typing its password. */
    confirm?: boolean;
    /** The card's main action (with `OIDC_ONLY`), styled like `AuthSubmit`. */
    primary?: boolean;
    className?: string;
};

/**
 * "Log in with SSO": a full page visit to the IdP (`/auth/oidc/redirect`), not an Inertia visit, since the IdP is
 * another site. Renders nothing while single sign-on is off.
 */
export default function OidcButton({
    confirm = false,
    primary = false,
    className,
}: Props) {
    const { oidc } = usePage().props;

    if (!oidc?.enabled) {
        return null;
    }

    const label = confirm
        ? t('auth.confirmWithSso')
        : (oidc.label ?? t('auth.logInWithSso'));

    return (
        <Button
            asChild
            variant={primary ? 'default' : 'outline'}
            className={cn(
                'w-full',
                primary
                    ? 'h-12 rounded-full bg-foreground text-base font-semibold text-background hover:bg-foreground/90'
                    : 'h-11',
                className,
            )}
        >
            <a
                href={redirect.url(
                    confirm ? { query: { confirm: 1 } } : undefined,
                )}
                data-test="oidc-button"
            >
                <LogIn className="size-4" aria-hidden />
                {label}
            </a>
        </Button>
    );
}

/** The reasons `App\Auth\Oidc\OidcLoginRefused` may give, and their message. */
const OIDC_ERRORS: Record<string, TextKey> = {
    failed: 'auth.oidcError.failed',
    cancelled: 'auth.oidcError.cancelled',
    missing_email: 'auth.oidcError.missing_email',
    unverified_email: 'auth.oidcError.unverified_email',
    linked_elsewhere: 'auth.oidcError.linked_elsewhere',
    registration_closed: 'auth.oidcError.registration_closed',
    wrong_account: 'auth.oidcError.wrong_account',
};

/** The message for a refused single sign-on (a generic one for an unknown reason). */
export function oidcErrorMessage(
    reason: string | null | undefined,
): string | null {
    if (!reason) {
        return null;
    }

    return t(OIDC_ERRORS[reason] ?? 'auth.oidcError.failed');
}
