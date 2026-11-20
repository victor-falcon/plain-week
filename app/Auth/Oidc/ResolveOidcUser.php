<?php

namespace App\Auth\Oidc;

use App\Actions\Fortify\CreateNewUser;
use App\Auth\Registration;
use App\Models\User;
use Illuminate\Auth\Events\Registered;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Laravel\Passport\Passport;
use Laravel\Socialite\Contracts\User as IdentityUser;

/**
 * Finds the local account for an identity the IdP vouched for, linking or creating it when allowed:
 *
 * 1. The account already linked to this issuer and `sub`.
 * 2. Otherwise the account with the same email, only when the IdP says `email_verified` is true (an unverified
 *    address could belong to anyone). It is then linked to this `sub`, unless it is already linked to another one
 *    at the same issuer. An account whose own email was never verified may have been created by someone else
 *    with the victim's address ("pre-hijacking"): it is linked, but loses every credential set before (password,
 *    two-factor, passkeys, sessions, app tokens).
 * 3. Otherwise a new password-less account, only while sign-up is open (`App\Auth\Registration`).
 */
final class ResolveOidcUser
{
    public function __construct(private readonly Request $request) {}

    public function __invoke(IdentityUser $identity): User
    {
        try {
            return $this->resolve($identity);
        } catch (UniqueConstraintViolationException) {
            // Two first logins at once (a double click): the other one created or linked the account.
            return $this->resolve($identity);
        }
    }

    private function resolve(IdentityUser $identity): User
    {
        $issuer = Oidc::issuer();
        $sub = (string) $identity->getId();

        $linked = User::query()->where('oidc_issuer', $issuer)->where('oidc_sub', $sub)->first();

        if ($linked !== null) {
            return $linked;
        }

        $email = Str::lower(trim((string) $identity->getEmail()));

        if ($email === '' || ! filter_var($email, FILTER_VALIDATE_EMAIL)) {
            throw new OidcLoginRefused(OidcLoginRefused::MISSING_EMAIL);
        }

        $verified = self::emailVerified($identity);
        $existing = User::query()->whereRaw('lower(email) = ?', [$email])->first();

        if ($existing !== null) {
            if (! $verified) {
                throw new OidcLoginRefused(OidcLoginRefused::UNVERIFIED_EMAIL);
            }

            if ($existing->oidc_issuer === $issuer && $existing->oidc_sub !== null) {
                throw new OidcLoginRefused(OidcLoginRefused::LINKED_ELSEWHERE);
            }

            return DB::transaction(function () use ($existing, $issuer, $sub): User {
                if ($existing->email_verified_at === null) {
                    $this->revokeCredentials($existing);
                }

                // A link to a previous IdP (another issuer) is replaced: the instance moved to this one.
                $existing->forceFill([
                    'oidc_issuer' => $issuer,
                    'oidc_sub' => $sub,
                    'email_verified_at' => $existing->email_verified_at ?? now(),
                ])->save();

                return $existing;
            });
        }

        if (! Registration::open()) {
            throw new OidcLoginRefused(OidcLoginRefused::REGISTRATION_CLOSED);
        }

        $user = new User;
        $user->forceFill([
            'name' => Str::limit(self::name($identity, $email), 255, ''),
            'email' => $email,
            'password' => null,
            'email_verified_at' => $verified ? now() : null,
            'oidc_issuer' => $issuer,
            'oidc_sub' => $sub,
            'locale' => $this->request->getPreferredLanguage(CreateNewUser::LOCALES),
        ])->save();

        // Like a sign-up: an unverified address gets the verification email.
        event(new Registered($user));

        return $user;
    }

    /**
     * Whoever registered the address without proving it may still hold a way in: drop them all. The owner of the
     * address logs in through the IdP from now on, and can set a new password.
     */
    private function revokeCredentials(User $user): void
    {
        $user->forceFill([
            'password' => null,
            'remember_token' => Str::random(60),
            'two_factor_secret' => null,
            'two_factor_recovery_codes' => null,
            'two_factor_confirmed_at' => null,
        ]);

        $user->passkeys()->delete();

        // App and agent tokens (their refresh tokens go with them) and pending authorization codes.
        Passport::token()->newQuery()->where('user_id', $user->getKey())->delete();
        Passport::authCode()->newQuery()->where('user_id', $user->getKey())->delete();

        if (config('session.driver') === 'database') {
            DB::table(config()->string('session.table', 'sessions'))->where('user_id', $user->getKey())->delete();
        }
    }

    /**
     * Only a real `true` counts (some IdPs send the string "true").
     */
    private static function emailVerified(IdentityUser $identity): bool
    {
        $raw = method_exists($identity, 'getRaw') ? $identity->getRaw() : [];
        $value = $raw['email_verified'] ?? false;

        return $value === true || (is_string($value) && strtolower($value) === 'true');
    }

    private static function name(IdentityUser $identity, string $email): string
    {
        $name = trim((string) ($identity->getName() ?? $identity->getNickname() ?? ''));

        return $name !== '' ? $name : Str::before($email, '@');
    }
}
