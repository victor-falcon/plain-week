<?php

namespace App\Providers;

use App\Agents\AuthorizationPage;
use App\Mcp\McpConfig;
use App\Push\PushSender;
use App\Push\WebPushSender;
use Carbon\CarbonImmutable;
use Illuminate\Cache\RateLimiting\Limit;
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
    /**
     * Register any application services.
     */
    public function register(): void
    {
        // The webhook route is registered in bootstrap/app.php, gated by SaaS mode.
        Cashier::ignoreRoutes();

        $this->app->bind(PushSender::class, WebPushSender::class);

        // Passport registers its /oauth routes while booting, so this must be decided here.
        if (! McpConfig::enabled()) {
            Passport::ignoreRoutes();
        }

        // Only the authorization code grant (MCP clients) and personal access tokens are used.
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

        $this->configureMcp();

        // `composer dev` also runs the scheduler (routes/console.php), like the Docker image does.
        DevCommands::artisan('schedule:work', 'scheduler');
    }

    /**
     * The MCP server's OAuth server (Passport) and rate limit; see docs/architecture.md#mcp-server.
     */
    protected function configureMcp(): void
    {
        // The consent page is an Inertia card like the auth pages.
        Passport::authorizationView(AuthorizationPage::render(...));

        // OAuth clients refresh short-lived access tokens; the refresh token lasts a year (Passport's default).
        Passport::tokensExpireIn(Date::now()->addDay());

        // Headless agents keep a personal token until it is revoked in Settings › Agents.
        Passport::personalAccessTokensExpireIn(Date::now()->addYears(10));

        RateLimiter::for('mcp', fn (Request $request) => Limit::perMinute(config()->integer('mcp.rate_limit'))
            ->by($request->user()?->getAuthIdentifier() ?? $request->ip()));
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
