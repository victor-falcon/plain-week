<?php

namespace App\Auth\Oidc;

use App\Models\User;

/**
 * Logging in through an external OpenID Connect identity provider (config/oidc.php). It is available once the
 * issuer and the client id are set and the kill switch (`OIDC_ENABLED`, off by default in SaaS mode) is on.
 * `OIDC_ONLY` then makes the IdP the only way in.
 */
final class Oidc
{
    public static function enabled(): bool
    {
        return (bool) config('oidc.enabled')
            && filled(config('oidc.issuer'))
            && filled(config('oidc.client_id'));
    }

    /**
     * Password login, the sign-up form, password reset and passkey login are off: the IdP is the only way in.
     */
    public static function only(): bool
    {
        return self::enabled() && (bool) config('oidc.only');
    }

    /**
     * The configured issuer without its trailing slash, as stored next to each linked account.
     */
    public static function issuer(): string
    {
        return rtrim(config()->string('oidc.issuer'), '/');
    }

    /**
     * Whether the account is linked to the instance's IdP, so logging in there again proves it is them.
     */
    public static function linked(User $user): bool
    {
        return self::enabled() && $user->oidc_sub !== null && $user->oidc_issuer === self::issuer();
    }

    /**
     * The button text, or null for the translated default ("Log in with SSO").
     */
    public static function label(): ?string
    {
        $label = config('oidc.label');

        return is_string($label) && $label !== '' ? $label : null;
    }

    /**
     * The shared `oidc` prop of every page.
     *
     * @return array{enabled: bool, only: bool, label: string|null}
     */
    public static function props(): array
    {
        $enabled = self::enabled();

        return [
            'enabled' => $enabled,
            'only' => self::only(),
            'label' => $enabled ? self::label() : null,
        ];
    }
}
