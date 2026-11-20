<?php

namespace App\Http\Controllers\Auth;

use App\Auth\Oidc\Oidc;
use App\Auth\Oidc\OidcLoginRefused;
use App\Auth\Oidc\OidcProvider;
use App\Auth\Oidc\ResolveOidcUser;
use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Laravel\Fortify\Events\TwoFactorAuthenticationChallenged;
use Laravel\Fortify\Fortify;
use Laravel\Socialite\Contracts\Provider;
use Laravel\Socialite\Contracts\User as IdentityUser;
use Laravel\Socialite\Facades\Socialite;
use Laravel\Socialite\Two\InvalidStateException;
use Symfony\Component\HttpFoundation\RedirectResponse as SymfonyRedirectResponse;
use Throwable;

/**
 * Logging in through the OpenID Connect IdP (`/auth/oidc/redirect` → the IdP → `/auth/oidc/callback`), and, for a
 * signed-in account linked to it, re-authenticating there instead of typing a password (`?confirm=1`): that is how
 * a password-less account passes Laravel's "confirm password" step before sensitive settings.
 */
class OidcController extends Controller
{
    /** How long ago the IdP may have authenticated the user for a re-authentication to count (`auth_time`). */
    private const int REAUTH_MAX_AGE = 600;

    public function redirect(Request $request): RedirectResponse|SymfonyRedirectResponse
    {
        $user = $request->user();
        $confirm = $request->boolean('confirm') && $user !== null;

        if ($user !== null && ! $confirm) {
            return redirect()->intended(Fortify::redirects('login'));
        }

        $request->session()->put('oidc.intent', $confirm ? 'confirm' : 'login');

        if ($confirm) {
            $request->session()->put('url.intended', $this->confirmTarget($request));
        }

        try {
            $driver = $this->provider($request);

            if ($driver instanceof OidcProvider) {
                // A re-authentication asks the IdP to log the user in again, not to reuse its session. Set on every
                // redirect: the driver instance may serve several requests.
                $driver->with($confirm ? ['prompt' => 'login', 'max_age' => self::REAUTH_MAX_AGE] : []);
            }

            return $driver->redirect();
        } catch (Throwable $e) {
            report($e);

            return $this->refused($confirm, OidcLoginRefused::FAILED);
        }
    }

    public function callback(Request $request, ResolveOidcUser $resolve): RedirectResponse
    {
        $confirm = $request->session()->pull('oidc.intent') === 'confirm' && $request->user() !== null;

        // Only a re-authentication may come back signed in: never switch a signed-in browser to another account.
        if (! $confirm && $request->user() !== null) {
            return redirect()->intended(Fortify::redirects('login'));
        }

        if ($request->filled('error')) {
            return $this->refused($confirm, $request->query('error') === 'access_denied'
                ? OidcLoginRefused::CANCELLED
                : OidcLoginRefused::FAILED);
        }

        try {
            $identity = $this->provider($request)->user();
        } catch (InvalidStateException) {
            return $this->refused($confirm, OidcLoginRefused::FAILED);
        } catch (Throwable $e) {
            report($e);

            return $this->refused($confirm, OidcLoginRefused::FAILED);
        }

        if ($confirm) {
            return $this->confirm($request, $identity);
        }

        try {
            $user = $resolve($identity);
        } catch (OidcLoginRefused $e) {
            return $this->refused(false, $e->reason);
        }

        return $this->login($request, $user);
    }

    /**
     * Signs the user in, through Fortify's two-factor challenge when the account has two-factor on: the IdP proves
     * who the user is there, the account's own second factor still applies here.
     */
    private function login(Request $request, User $user): RedirectResponse
    {
        if ($user->two_factor_secret !== null && $user->two_factor_confirmed_at !== null) {
            $request->session()->put([
                'login.id' => $user->getKey(),
                'login.remember' => true,
            ]);

            TwoFactorAuthenticationChallenged::dispatch($user);

            return redirect()->route('two-factor.login');
        }

        Auth::login($user, remember: true);
        $request->session()->regenerate();

        return redirect()->intended(Fortify::redirects('login'));
    }

    /**
     * The IdP re-authenticated the signed-in account: it counts as confirming the password.
     */
    private function confirm(Request $request, IdentityUser $identity): RedirectResponse
    {
        /** @var User $user */
        $user = $request->user();

        if (! Oidc::linked($user) || ! hash_equals((string) $user->oidc_sub, (string) $identity->getId())) {
            return $this->refused(true, OidcLoginRefused::WRONG_ACCOUNT);
        }

        // `max_age` was requested, so the IdP must say when it authenticated the user (OIDC Core 3.1.2.1). Without
        // a recent `auth_time` the IdP may have reused its session, which proves nothing.
        $authTime = method_exists($identity, 'getRaw') ? ($identity->getRaw()['auth_time'] ?? null) : null;

        if (! is_numeric($authTime) || (int) $authTime < now()->getTimestamp() - self::REAUTH_MAX_AGE) {
            return $this->refused(true, OidcLoginRefused::NOT_REAUTHENTICATED);
        }

        $request->session()->passwordConfirmed();

        return redirect()->intended(route('profile.edit'));
    }

    /**
     * Where a re-authentication returns: the page RequirePassword sent to the confirm page, or else the page with the
     * button (e.g. "Delete account"). Only a URL of this app, never another site the Referer may name.
     */
    private function confirmTarget(Request $request): string
    {
        $previous = $request->headers->get('referer') ?? $request->session()->previousUrl();
        $target = $previous !== null && $this->isConfirmPage($previous)
            ? $request->session()->get('url.intended')
            : $previous;

        return is_string($target) && $this->isOwnUrl($target) && ! $this->isConfirmPage($target)
            ? $target
            : route('profile.edit');
    }

    private function isOwnUrl(string $url): bool
    {
        $root = rtrim(url('/'), '/');

        return $url === $root || str_starts_with($url, $root.'/');
    }

    private function isConfirmPage(string $url): bool
    {
        return strtok($url, '?#') === route('password.confirm');
    }

    /**
     * The `oidc` driver for this request. Socialite keeps its drivers between requests in a long-lived process
     * (Octane, tests), with the request they were made for.
     */
    private function provider(Request $request): Provider
    {
        $provider = Socialite::driver('oidc');

        return $provider instanceof OidcProvider ? $provider->setRequest($request) : $provider;
    }

    private function refused(bool $confirm, string $reason): RedirectResponse
    {
        return redirect()->route($confirm ? 'password.confirm' : 'login')->with('oidcError', $reason);
    }
}
