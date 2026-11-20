<?php

namespace App\Providers;

use App\Auth\Oidc\Oidc;
use App\Auth\Oidc\OidcDiscovery;
use App\Auth\Oidc\OidcProvider;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;
use Laravel\Socialite\Contracts\Factory as Socialite;
use Laravel\Socialite\SocialiteManager;

/**
 * Single sign-on with an OpenID Connect IdP (config/oidc.php): the `oidc` Socialite driver and the rate limit of its
 * routes. See docs/architecture.md (Single sign-on).
 */
class OidcServiceProvider extends ServiceProvider
{
    public function boot(): void
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

        RateLimiter::for('oidc', fn (Request $request) => Limit::perMinute(20)->by($request->ip()));
    }
}
