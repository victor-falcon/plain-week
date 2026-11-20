<?php

namespace App\Auth\Oidc;

use RuntimeException;

/**
 * A login through the IdP that we turn down; the login page explains `$reason` (see `auth.oidcError.*`).
 */
final class OidcLoginRefused extends RuntimeException
{
    /** Something went wrong with the IdP (or the user came back with an expired or forged state). */
    public const string FAILED = 'failed';

    /** The user cancelled at the IdP. */
    public const string CANCELLED = 'cancelled';

    /** The IdP sent no email address. */
    public const string MISSING_EMAIL = 'missing_email';

    /** A local account has this email, but the IdP has not verified it. */
    public const string UNVERIFIED_EMAIL = 'unverified_email';

    /** The local account with this email is linked to another identity at the same IdP. */
    public const string LINKED_ELSEWHERE = 'linked_elsewhere';

    /** No local account, and sign-up is closed (REGISTRATION_ENABLED=false). */
    public const string REGISTRATION_CLOSED = 'registration_closed';

    /** Re-authentication (instead of a password) came back as another identity than the signed-in account's. */
    public const string WRONG_ACCOUNT = 'wrong_account';

    public function __construct(public readonly string $reason)
    {
        parent::__construct("OIDC login refused: {$reason}");
    }
}
