<?php

namespace App\Providers;

use App\Agents\AuthorizationPage;
use App\Push\PushSender;
use App\Push\WebPushSender;
use App\Support\TranslationOverridesLoader;
use App\Support\Translations;
use Carbon\CarbonImmutable;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Contracts\Translation\Loader;
use Illuminate\Foundation\DevCommands;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Date;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;
use Illuminate\Validation\Rules\Password;
use Laravel\Cashier\Cashier;
use Laravel\Passport\Passport;

class AppServiceProvider extends ServiceProvider
{
    /** Sync requests (`throttle:sync`) a user may send per minute, web and app API together. */
    public const int SYNC_RATE_LIMIT = 120;

    /** Other app API requests (`throttle:api`) a user may send per minute. */
    public const int API_RATE_LIMIT = 120;

    /**
     * Register any application services.
     */
    public function register(): void
    {
        // The webhook route is registered in bootstrap/app.php, gated by SaaS mode.
        Cashier::ignoreRoutes();

        $this->app->bind(PushSender::class, WebPushSender::class);

        // Self-hosted translation files (TRANSLATIONS_PATH), read at most once per request.
        $this->app->scoped(Translations::class);
        $this->app->extend('translation.loader', fn (Loader $loader) => new TranslationOverridesLoader($loader));

        // Only the authorization code grant (MCP clients, native apps) and personal access tokens are used.
        Passport::$deviceCodeGrantEnabled = false;
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        $this->configureDefaults();

        // Prices are VAT-inclusive; Stripe Tax computes the tax part in Checkout.
        Cashier::calculateTaxes();

        $this->configureOAuth();

        $this->configureRateLimits();

        // `composer dev` also runs the scheduler (routes/console.php), like the Docker image does.
        DevCommands::artisan('schedule:work', 'scheduler');
    }

    /**
     * The OAuth server (Passport) behind `/mcp` and the app API; see docs/architecture.md#mcp-server.
     */
    protected function configureOAuth(): void
    {
        // The consent page is an Inertia card like the auth pages.
        Passport::authorizationView(AuthorizationPage::render(...));

        // OAuth clients refresh short-lived access tokens; the refresh token lasts a year (Passport's default).
        Passport::tokensExpireIn(Date::now()->addDay());

        // Headless agents and apps keep a personal token until it is revoked in Settings › Agents & apps.
        Passport::personalAccessTokensExpireIn(Date::now()->addYears(10));
    }

    /**
     * Per-user limits for the token clients and sync (per IP before signing in).
     */
    protected function configureRateLimits(): void
    {
        $byUser = fn (Request $request): string => (string) ($request->user()?->getAuthIdentifier() ?? $request->ip());

        RateLimiter::for('mcp', fn (Request $request) => Limit::perMinute(config()->integer('mcp.rate_limit'))->by($byUser($request)));

        // `/sync/*` and `/api/v1/sync/*`: up to 500 records a request, so the requests are capped too.
        RateLimiter::for('sync', fn (Request $request) => Limit::perMinute(self::SYNC_RATE_LIMIT)->by($byUser($request)));

        // The rest of the app API (`/api/v1/me`).
        RateLimiter::for('api', fn (Request $request) => Limit::perMinute(self::API_RATE_LIMIT)->by($byUser($request)));
    }

    /**
     * Configure default behaviors for production-ready applications.
     */
    protected function configureDefaults(): void
    {
        Date::use(CarbonImmutable::class);

        DB::prohibitDestructiveCommands(
            app()->isProduction(),
        );

        Password::defaults(fn (): ?Password => app()->isProduction()
            ? Password::min(12)
                ->mixedCase()
                ->letters()
                ->numbers()
                ->symbols()
                ->uncompromised()
            : null,
        );
    }
}
