<?php

namespace App\Providers;

use App\Actions\Fortify\CreateNewUser;
use App\Actions\Fortify\ResetUserPassword;
use App\Auth\Oidc\Oidc;
use App\Auth\Oidc\OidcDiscovery;
use App\Auth\Oidc\OidcProvider;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;
use Illuminate\Support\Str;
use Illuminate\Validation\Rules\Password;
use Inertia\Inertia;
use Laravel\Fortify\Features;
use Laravel\Fortify\Fortify;
use Laravel\Socialite\Contracts\Factory as Socialite;
use Laravel\Socialite\SocialiteManager;

class FortifyServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        $this->configureActions();
        $this->configureViews();
        $this->configureRateLimiting();
        $this->configureOidc();
    }

    /**
     * The `oidc` Socialite driver: the OpenID Connect IdP from config/oidc.php.
     */
    private function configureOidc(): void
    {
        $this->app->afterResolving(Socialite::class, function (SocialiteManager $socialite): void {
            $socialite->extend('oidc', function () use ($socialite) {
                /** @var OidcProvider $provider */
                $provider = $socialite->buildProvider(OidcProvider::class, [
                    'client_id' => config('oidc.client_id'),
                    'client_secret' => config('oidc.client_secret'),
                    'redirect' => route('oidc.callback'),
                ]);

                return $provider->setDiscovery(new OidcDiscovery(Oidc::issuer()));
            });
        });
    }

    /**
     * Configure Fortify actions.
     */
    private function configureActions(): void
    {
        Fortify::resetUserPasswordsUsing(ResetUserPassword::class);
        Fortify::createUsersUsing(CreateNewUser::class);
    }

    /**
     * Configure Fortify views.
     */
    private function configureViews(): void
    {
        Fortify::loginView(fn (Request $request) => Inertia::render('auth/login', [
            'canResetPassword' => Features::enabled(Features::resetPasswords()) && ! Oidc::only(),
            'status' => $request->session()->get('status'),
            // Why a login through the IdP was turned down (OidcLoginRefused::*).
            'oidcError' => $request->session()->get('oidcError'),
        ]));

        Fortify::resetPasswordView(fn (Request $request) => Inertia::render('auth/reset-password', [
            'email' => $request->email,
            'token' => $request->route('token'),
            'passwordRules' => Password::defaults()->toPasswordRulesString(),
        ]));

        Fortify::requestPasswordResetLinkView(fn (Request $request) => Inertia::render('auth/forgot-password', [
            'status' => $request->session()->get('status'),
        ]));

        Fortify::verifyEmailView(fn (Request $request) => Inertia::render('auth/verify-email', [
            'status' => $request->session()->get('status'),
        ]));

        Fortify::registerView(fn () => Inertia::render('auth/register', [
            'passwordRules' => Password::defaults()->toPasswordRulesString(),
        ]));

        Fortify::twoFactorChallengeView(fn () => Inertia::render('auth/two-factor-challenge'));

        // A password-less account (created through the IdP) confirms by logging in at the IdP again instead.
        Fortify::confirmPasswordView(fn (Request $request) => Inertia::render('auth/confirm-password', [
            'hasPassword' => $request->user()->password !== null,
            'canConfirmWithOidc' => Oidc::linked($request->user()),
            'oidcError' => $request->session()->get('oidcError'),
        ]));
    }

    /**
     * Configure rate limiting.
     */
    private function configureRateLimiting(): void
    {
        RateLimiter::for('two-factor', function (Request $request) {
            return Limit::perMinute(5)->by($request->session()->get('login.id'));
        });

        RateLimiter::for('login', function (Request $request) {
            $throttleKey = Str::transliterate(Str::lower($request->input(Fortify::username())).'|'.$request->ip());

            return Limit::perMinute(5)->by($throttleKey);
        });

        RateLimiter::for('oidc', function (Request $request) {
            return Limit::perMinute(20)->by($request->ip());
        });

        RateLimiter::for('passkeys', function (Request $request) {
            return Limit::perMinute(10)->by(
                ($request->input('credential.id') ?: $request->session()->getId()).'|'.$request->ip(),
            );
        });
    }
}
