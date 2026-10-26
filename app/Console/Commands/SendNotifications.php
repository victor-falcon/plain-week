<?php

namespace App\Console\Commands;

use App\Jobs\SendPushNotifications;
use App\Models\User;
use App\Push\PushConfig;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;
use Illuminate\Support\Collection;

#[Signature('notifications:send')]
#[Description('Queue the due push notifications of every user with a subscribed browser (runs every minute)')]
class SendNotifications extends Command
{
    public function handle(): int
    {
        if (! PushConfig::enabled()) {
            return self::SUCCESS;
        }

        User::query()
            ->whereHas('pushSubscriptions')
            ->chunkById(500, function (Collection $users) {
                $users->each(fn (User $user) => SendPushNotifications::dispatch($user));
            });

        return self::SUCCESS;
    }
}
