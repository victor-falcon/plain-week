<?php

namespace App\Http\Middleware;

use App\Integrations\GoogleCalendar\GoogleOAuth;
use App\Models\User;
use App\Push\PushConfig;
use Illuminate\Http\Request;
use Inertia\Middleware;

class HandleInertiaRequests extends Middleware
{
    /** Where "Send feedback" leads on a self-hosted instance. */
    public const FEEDBACK_DISCUSSIONS_URL = 'https://github.com/victor-falcon/plain-week/discussions';

    public const FEEDBACK_SUBJECT = 'Plain Week feedback';

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

        return [
            ...parent::share($request),
            'name' => config('app.name'),
            'auth' => [
                'user' => $request->user(),
            ],
            'saas' => [
                'enabled' => (bool) config('saas.enabled'),
            ],
            // Where "Send feedback" leads: the operator's inbox on a SaaS instance, GitHub otherwise.
            'feedbackUrl' => self::feedbackUrl(),
            // Integrations this instance offers (each needs its own credentials).
            'integrations' => [
                'googleCalendar' => GoogleOAuth::configured(),
            ],
            // Web Push: the settings page and the subscribe flow exist only with VAPID keys.
            'notifications' => [
                'enabled' => $pushEnabled,
                'vapidPublicKey' => $pushEnabled ? PushConfig::publicKey() : null,
            ],
            // Lazy: computed per request only for signed-in users (it may query the subscription).
            'account' => fn () => $user instanceof User ? [
                'hasAccess' => $user->hasAccess(),
                'plan' => $user->plan()?->value,
            ] : null,
            'sidebarOpen' => ! $request->hasCookie('sidebar_state') || $request->cookie('sidebar_state') === 'true',
        ];
    }

    private static function feedbackUrl(): string
    {
        if (! config('saas.enabled')) {
            return self::FEEDBACK_DISCUSSIONS_URL;
        }

        return 'mailto:'.config('saas.seller.email').'?subject='.rawurlencode(self::FEEDBACK_SUBJECT);
    }
}
