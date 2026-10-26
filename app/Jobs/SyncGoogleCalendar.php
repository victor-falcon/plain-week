<?php

namespace App\Jobs;

use App\Integrations\GoogleCalendar\GoogleCalendarDisconnected;
use App\Integrations\GoogleCalendar\GoogleCalendarMissing;
use App\Integrations\GoogleCalendar\GoogleCalendarRateLimited;
use App\Integrations\GoogleCalendar\GoogleOAuth;
use App\Integrations\GoogleCalendar\SyncGoogleCalendarEvents;
use App\Models\GoogleCalendarConnection;
use App\Models\User;
use DateTimeInterface;
use Illuminate\Contracts\Queue\ShouldBeUniqueUntilProcessing;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Queue\Middleware\WithoutOverlapping;
use Illuminate\Support\Str;
use Throwable;

/**
 * Syncs one user's tasks to their Google calendar ({@see SyncGoogleCalendarEvents}), in the background. Queued after a
 * sync push changed their tasks (a few seconds later, so a burst of pushes makes one run), after connecting, and daily
 * for everyone (`google-calendar:sync`). One waits in the queue per user at most, and runs of one user never overlap.
 */
class SyncGoogleCalendar implements ShouldBeUniqueUntilProcessing, ShouldQueue
{
    use Queueable;

    /** Seconds a push waits before syncing, so the pushes of one editing session make one run. */
    public const int DEBOUNCE_SECONDS = 10;

    /** How long a queued run blocks another one for the same user, in case it is lost from the queue. */
    public int $uniqueFor = 3600;

    public int $maxExceptions = 3;

    public function __construct(public readonly int $userId) {}

    /**
     * Queues a sync of the user's calendar if they have a working connection.
     */
    public static function dispatchFor(User $user, int $delaySeconds = 0): void
    {
        if (! GoogleOAuth::configured()) {
            return;
        }

        $connection = $user->googleCalendarConnection()->first();

        if ($connection !== null && ! $connection->isBroken()) {
            self::dispatch($user->id)->delay($delaySeconds);
        }
    }

    public function uniqueId(): string
    {
        return (string) $this->userId;
    }

    /**
     * @return list<object>
     */
    public function middleware(): array
    {
        return [(new WithoutOverlapping((string) $this->userId))->releaseAfter(30)->expireAfter(600)];
    }

    /**
     * Rate limits and overlapping runs only delay the job; a run that keeps failing stops at `$maxExceptions`.
     */
    public function retryUntil(): DateTimeInterface
    {
        return now()->addHours(6);
    }

    /**
     * @return list<int>
     */
    public function backoff(): array
    {
        return [30, 120, 600];
    }

    public function handle(SyncGoogleCalendarEvents $sync): void
    {
        $connection = $this->connection();

        if ($connection === null || $connection->isBroken()) {
            return;
        }

        try {
            $error = $sync($connection);
        } catch (GoogleCalendarDisconnected) {
            // The client marked the connection broken; Settings › Integrations asks the user to reconnect.
            return;
        } catch (GoogleCalendarMissing) {
            $connection->forceFill(['last_error' => __('The “Plain Week” calendar was deleted in Google. Disconnect and connect again to create a new one.')])->save();

            return;
        } catch (GoogleCalendarRateLimited $e) {
            $this->release($e->retryAfter ?? min(60 << min(max($this->attempts() - 1, 0), 4), 900));

            return;
        }

        $connection->forceFill(['last_synced_at' => now(), 'last_error' => $error])->save();
    }

    public function failed(Throwable $e): void
    {
        $this->connection()?->forceFill(['last_error' => Str::limit($e->getMessage(), 500)])->save();
    }

    private function connection(): ?GoogleCalendarConnection
    {
        return GoogleCalendarConnection::query()->where('user_id', $this->userId)->first();
    }
}
