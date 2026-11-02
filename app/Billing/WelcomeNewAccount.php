<?php

namespace App\Billing;

use App\Mail\WelcomeEmail;
use App\Models\User;
use Illuminate\Support\Facades\Mail;

/**
 * Queues the welcome email the first time an account has access in SaaS mode
 * (lifetime granted or a weekly subscription stored). `users.welcomed_at` is
 * claimed with a conditional update, so the success redirect and the webhook
 * racing each other send it once.
 */
class WelcomeNewAccount
{
    public function __invoke(User $user): void
    {
        if (! config('saas.enabled') || $user->welcomed_at !== null || ! $user->hasAccess()) {
            return;
        }

        $claimed = User::whereKey($user->getKey())
            ->whereNull('welcomed_at')
            ->update(['welcomed_at' => now()]);

        if ($claimed === 0) {
            return;
        }

        Mail::to($user)->queue(new WelcomeEmail($user));
    }
}
