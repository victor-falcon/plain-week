<?php

namespace App\Push;

use App\Models\SentNotification;
use App\Models\User;
use Carbon\CarbonImmutable;
use Throwable;

/**
 * Sends a user's due notifications to every subscribed browser. Each one is recorded in `sent_notifications` before it
 * goes out, and only by the run that inserts the row, so overlapping or repeated runs never send it twice. One that no
 * browser accepted for a transient reason (or a send that throws) gives its row back, so the next run retries it while
 * it is still due; one lost to a crash in between is not. Subscriptions the push service reports gone are deleted.
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
        /** @var list<array{claim: array<string, mixed>, message: PushMessage}> $claims */
        $claims = [];

        foreach ($this->dueNotifications->for($user, $now) as $due) {
            $claim = [
                'user_id' => $user->id,
                'occurrence_key' => $due->occurrenceKey(),
                'kind' => $due->kind->value,
                'date' => $due->date,
            ];

            if (SentNotification::query()->insertOrIgnore([...$claim, 'created_at' => now()]) === 0) {
                continue;
            }

            $message = $due->message();
            $claims[] = ['claim' => $claim, 'message' => $message];

            foreach ($subscriptions as $subscription) {
                $deliveries[] = new PushDelivery($subscription, $message);
            }
        }

        if ($deliveries === []) {
            return 0;
        }

        try {
            $report = $this->sender->send($deliveries);
        } catch (Throwable $e) {
            foreach ($claims as ['claim' => $claim]) {
                SentNotification::query()->where($claim)->delete();
            }

            throw $e;
        }

        $sent = 0;

        foreach ($claims as ['claim' => $claim, 'message' => $message]) {
            if ($report->shouldRetry($message)) {
                SentNotification::query()->where($claim)->delete();
            } else {
                $sent++;
            }
        }

        if (($delivered = $report->endpoints(PushResult::Delivered)) !== []) {
            $user->pushSubscriptions()->whereEndpointIn($delivered)->update(['last_used_at' => now()]);
        }

        if (($expired = $report->endpoints(PushResult::Expired)) !== []) {
            $user->pushSubscriptions()->whereEndpointIn($expired)->delete();
        }

        return $sent;
    }
}
