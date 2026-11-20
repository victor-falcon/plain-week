<?php

namespace App\Jobs;

use App\Models\User;
use App\Push\SendDueNotifications;
use App\Support\Translations;
use Carbon\CarbonImmutable;
use Illuminate\Contracts\Queue\ShouldBeUnique;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\App;
use Illuminate\Support\Facades\Log;

/**
 * Sends one user's due push notifications. Dispatched every minute by `notifications:send`; unique per user while
 * queued, so a stopped worker does not pile up a job per minute.
 */
class SendPushNotifications implements ShouldBeUnique, ShouldQueue
{
    use Queueable;

    public bool $deleteWhenMissingModels = true;

    /**
     * The catch-up window: a job still waiting after it would find nothing due anyway.
     */
    public int $uniqueFor = 600;

    public function __construct(public User $user) {}

    public function uniqueId(): string
    {
        return (string) $this->user->id;
    }

    public function handle(SendDueNotifications $send): void
    {
        // A lapsed plan in SaaS mode stops the notifications, like it stops sync.
        if (! $this->user->hasAccess()) {
            return;
        }

        // There is no request to take the language from: the account's preference, else the instance default.
        $locale = App::getLocale();
        App::setLocale($this->user->preferredLocale() ?? app(Translations::class)->fallback());

        try {
            $sent = $send($this->user, CarbonImmutable::now());
        } finally {
            App::setLocale($locale);
        }

        if ($sent > 0) {
            Log::info('Sent push notifications.', ['user_id' => $this->user->id, 'notifications' => $sent]);
        }
    }
}
