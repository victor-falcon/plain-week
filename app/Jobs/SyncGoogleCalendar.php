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
use Illuminate\Support\Facades\Cache;
use Throwable;

/**
 * Syncs one user's tasks to their Google calendar ({@see SyncGoogleCalendarEvents}), in the background. Queued after a
 * sync push changed their tasks (a few seconds later, so a burst of pushes makes one run), after connecting, when
 * their time zone changes, and daily for everyone (`google-calendar:sync`). One waits in the queue per user at most,
 * runs of one user never overlap, and a long sync goes on in several short runs so the single worker is never held
 * for long.
 */
class SyncGoogleCalendar implements ShouldBeUniqueUntilProcessing, ShouldQueue
{
    use Queueable;

    /** Seconds a push waits before syncing, so the pushes of one editing session make one run. */
    public const int DEBOUNCE_SECONDS = 10;

    /** A run stops starting calls after this long and goes on in the next one. */
    private const int RUN_SECONDS = 45;

    /** Below the database queue's `retry_after` (90 s), so a slow run is never handed out twice. */
    public int $timeout = 80;

    /** How long a queued run blocks another one for the same user, in case it is lost from the queue. */
    public int $uniqueFor = 3600;

    public int $maxExceptions = 3;

    public function __construct(public readonly int $userId) {}

    /**
     * Queues a sync of the user's calendar if they have a working connection. Never fails the caller: the sync is
     * background work, and the daily run catches up on a dispatch that did not happen.
     */
    public static function dispatchFor(User $user, int $delaySeconds = 0): void
    {
        try {
            if (GoogleOAuth::configured() && $user->googleCalendarConnection()->syncable()->exists()) {
                self::dispatch($user->id)->delay($delaySeconds);
            }
        } catch (Throwable $e) {
            report($e);
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
        return [(new WithoutOverlapping((string) $this->userId))->releaseAfter(30)->expireAfter(120)];
    }

    /**
     * Rate limits, long syncs and overlapping runs only delay the job; a run that keeps failing stops at
     * `$maxExceptions`.
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

        if ($connection === null || ! $connection->isSyncable()) {
            return;
        }

        // Google asked to slow down: a job queued by a later push waits too.
        $pausedFor = (int) Cache::get($this->pauseKey(), 0) - now()->getTimestamp();

        if ($pausedFor > 0) {
            $this->release($pausedFor);

            return;
        }

        try {
            $result = $sync($connection, now()->addSeconds(self::RUN_SECONDS)->toImmutable());
        } catch (GoogleCalendarDisconnected) {
            // The client marked the connection broken; Settings › Integrations asks the user to reconnect.
            return;
        } catch (GoogleCalendarMissing) {
            $connection->forceFill(['last_error' => __('The “Plain Week” calendar was deleted in Google. Disconnect and connect again to create a new one.')])->save();

            return;
        } catch (GoogleCalendarRateLimited $e) {
            $delay = $e->retryAfter ?? min(60 * $this->attempts(), 900);
            Cache::put($this->pauseKey(), now()->getTimestamp() + $delay, $delay);
            $this->release($delay);

            return;
        }

        if (! $result->complete) {
            $this->release(1);

            return;
        }

        $connection->forceFill(['last_synced_at' => now(), 'last_error' => $result->error])->save();
    }

    public function failed(Throwable $e): void
    {
        $this->connection()?->forceFill([
            'last_error' => __('Google Calendar could not be reached. Plain Week tries again with your next change.'),
        ])->save();
    }

    private function connection(): ?GoogleCalendarConnection
    {
        return GoogleCalendarConnection::query()->where('user_id', $this->userId)->first();
    }

    private function pauseKey(): string
    {
        return "google-calendar:paused:{$this->userId}";
    }
}
