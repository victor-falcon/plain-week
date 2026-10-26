<?php

namespace App\Push;

use App\Models\SentNotification;
use App\Models\User;
use Carbon\CarbonImmutable;

/**
 * Sends a user's due notifications to every subscribed browser. Each one is recorded in `sent_notifications` before it
 * goes out, and only by the run that inserts the row, so overlapping or repeated runs never send it twice (one lost to a
 * crash right after is not retried). Subscriptions the push service reports gone are deleted.
 */
final class SendDueNotifications
{
    public function __construct(
        private readonly DueNotifications $dueNotifications,
        private readonly PushSender $sender,
    ) {}

    /**
     * @return int How many notifications were sent (each to every subscription).
     */
    public function __invoke(User $user, CarbonImmutable $now): int
    {
        $subscriptions = $user->pushSubscriptions()->get();

        if ($subscriptions->isEmpty()) {
            return 0;
        }

        $deliveries = [];
        $sent = 0;

        foreach ($this->dueNotifications->for($user, $now) as $due) {
            $claimed = SentNotification::query()->insertOrIgnore([
                'user_id' => $user->id,
                'occurrence_key' => $due->occurrenceKey(),
                'kind' => $due->kind->value,
                'date' => $due->date,
                'created_at' => now(),
            ]);

            if ($claimed === 0) {
                continue;
            }

            $sent++;
            $message = $due->message();

            foreach ($subscriptions as $subscription) {
                $deliveries[] = new PushDelivery($subscription, $message);
            }
        }

        if ($deliveries === []) {
            return 0;
        }

        $report = $this->sender->send($deliveries);

        if ($report->delivered !== []) {
            $user->pushSubscriptions()->whereEndpointIn($report->delivered)->update(['last_used_at' => now()]);
        }

        if ($report->expired !== []) {
            $user->pushSubscriptions()->whereEndpointIn($report->expired)->delete();
        }

        return $sent;
    }
}
