<?php

namespace App\Http\Middleware;

use App\Auth\Oidc\Oidc;
use App\Auth\Registration;
use App\Integrations\GoogleCalendar\GoogleOAuth;
use App\Mcp\McpConfig;
use App\Models\User;
use App\Push\PushConfig;
use App\Support\Feedback;
use App\Support\Translations;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\App;
use Inertia\Inertia;
use Inertia\Middleware;

class HandleInertiaRequests extends Middleware
{
    /**
     * The root template that's loaded on the first page visit.
     *
     * @see https://inertiajs.com/server-side-setup#root-template
     *
     * @var string
     */
    protected $rootView = 'app';

    /**
     * Determines the current asset version.
     *
     * @see https://inertiajs.com/asset-versioning
     */
    public function version(Request $request): ?string
    {
        return parent::version($request);
    }

    /**
     * Define the props that are shared by default.
     *
     * @see https://inertiajs.com/shared-data
     *
     * @return array<string, mixed>
     */
    public function share(Request $request): array
    {
        $user = $request->user();
        $pushEnabled = PushConfig::enabled();
        $translations = app(Translations::class);
        $locale = App::getLocale();
        $messages = $translations->messages($locale);

        return [
            ...parent::share($request),
            'name' => config('app.name'),
            'auth' => [
                'user' => $request->user(),
                // A password-less account (created through the IdP) sets a password instead of changing it.
                'hasPassword' => $user instanceof User && $user->hasPassword(),
            ],
            // Sign-up links show only while registration is open (REGISTRATION_ENABLED) and the sign-up form
            // exists (not with OIDC_ONLY). Lazy: the "no users yet" check queries only when it is turned off.
            'canRegister' => fn () => ! Oidc::only() && Registration::open(),
            // Single sign-on through an OpenID Connect IdP (OIDC_*): the button and its label, and whether it is the
            // only way in.
            'oidc' => Oidc::props(),
            'saas' => [
                'enabled' => (bool) config('saas.enabled'),
            ],
            // Where "Send feedback" leads: the operator's inbox on a SaaS instance, GitHub otherwise.
            'feedbackUrl' => Feedback::url(),
            // Integrations this instance offers (each needs its own credentials).
            'integrations' => [
                'googleCalendar' => GoogleOAuth::configured(),
            ],
            // Web Push: the settings page and the subscribe flow exist only with VAPID keys.
            'notifications' => [
                'enabled' => $pushEnabled,
                'vapidPublicKey' => $pushEnabled ? PushConfig::publicKey() : null,
            ],
            // The MCP server for AI agents (MCP_ENABLED): Settings › Agents & apps shows its MCP part only while it is on.
            'mcp' => [
                'enabled' => McpConfig::enabled(),
            ],
            // Lazy: computed per request only for signed-in users (it may query the subscription).
            'account' => fn () => $user instanceof User ? $user->accountSummary() : null,
            // The interface language (App\Http\Middleware\SetLocale) and the instance's translations on top of the
            // bundled English catalog. The cached offline shell embeds them, so the planner renders translated
            // offline. `messages` is sent once per locale and content (the client keeps it between visits).
            'i18n' => [
                'locale' => $locale,
                'locales' => $translations->available(),
                'messages' => Inertia::once(fn () => (object) $messages)
                    ->as('i18n.'.$locale.'.'.hash('xxh3', (string) json_encode($messages))),
            ],
        ];
    }
}
