<?php

namespace App\Integrations\GoogleCalendar;

use App\Models\GoogleCalendarConnection;
use App\Models\GoogleCalendarEvent;
use App\Models\User;
use App\Tasks\TaskOccurrences;
use Carbon\CarbonImmutable;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\RequestException;

/**
 * Brings a connection's "Plain Week" calendar in line with the planner (one way: Google is never read). It computes
 * the events the planner calls for, compares them with the events it sent before (`google_calendar_events`, by key and
 * payload hash) and creates, updates or deletes only what changed. Every call to Google is saved as it succeeds, so a
 * run cut short (rate limits, its time limit, a stop) carries on where it was.
 *
 * The window: dated tasks and exception rows from {@see self::PAST_DAYS} days ago on, with no limit ahead; occurrences
 * a series generates only from {@see self::OCCURRENCE_PAST_DAYS} days ago to {@see self::OCCURRENCE_FUTURE_DAYS} days
 * ahead, so the window moves with the days. Events dated before the window are left as they are: the calendar keeps the
 * past.
 */
class SyncGoogleCalendarEvents
{
    public const int PAST_DAYS = 30;

    public const int OCCURRENCE_PAST_DAYS = 7;

    public const int OCCURRENCE_FUTURE_DAYS = 60;

    /** The end of "no limit ahead" for dated rows. */
    private const string LAST_DATE = '9999-12-31';

    public function __construct(
        private readonly GoogleCalendarClient $client,
        private readonly TaskOccurrences $occurrences,
    ) {}

    /**
     * Syncs until done or until `$deadline` passes (the run then reports itself incomplete).
     *
     * @throws GoogleCalendarDisconnected|GoogleCalendarRateLimited|GoogleCalendarMissing|RequestException|ConnectionException
     */
    public function __invoke(GoogleCalendarConnection $connection, ?CarbonImmutable $deadline = null): SyncResult
    {
        $calendarId = $connection->calendar_id;

        if (! $connection->isSyncable() || $calendarId === null) {
            return new SyncResult(complete: true);
        }

        $timeZone = $connection->user->timezoneOrDefault();
        $today = CarbonImmutable::now($timeZone)->startOfDay();
        $windowStart = $today->subDays(self::PAST_DAYS)->toDateString();
        $wanted = $this->wantedEvents($connection->user, $today, $timeZone);
        $sent = $this->sentEvents($connection, $windowStart, array_keys($wanted));
        $refusals = new Refusals;

        foreach ($sent as $key => $row) {
            if (isset($wanted[$key]) || $row->date < $windowStart) {
                continue;
            }

            if ($deadline?->isPast()) {
                return new SyncResult(complete: false, error: $refusals->first);
            }

            $refusals->attempt(function () use ($connection, $calendarId, $row) {
                $this->client->deleteEvent($connection, $calendarId, $row->google_event_id);
                $row->delete();
            });
        }

        foreach ($wanted as $key => $want) {
            $row = $sent[$key] ?? null;

            if (($row === null && ! $want->creatable) || $row?->payload_hash === $want->event->hash()) {
                continue;
            }

            if ($deadline?->isPast()) {
                return new SyncResult(complete: false, error: $refusals->first);
            }

            $row ??= $connection->events()->create([
                'key' => $key,
                'google_event_id' => self::newEventId(),
                'date' => $want->event->date,
            ]);

            $refusals->attempt(fn () => $this->put($connection, $calendarId, $row, $want->event));
        }

        return new SyncResult(complete: true, error: $refusals->first);
    }

    /**
     * The events the planner calls for, by key.
     *
     * @return array<string, WantedEvent>
     */
    private function wantedEvents(User $user, CarbonImmutable $today, string $timeZone): array
    {
        $occurrencesFrom = $today->subDays(self::OCCURRENCE_PAST_DAYS)->toDateString();
        $occurrencesTo = $today->addDays(self::OCCURRENCE_FUTURE_DAYS);

        $items = $this->occurrences->forUser($user, $today->subDays(self::PAST_DAYS), $occurrencesTo)
            ->merge($this->occurrences->rowsForUser($user, $occurrencesTo->addDay(), CarbonImmutable::parse(self::LAST_DATE)));

        $wanted = [];

        foreach ($items as $item) {
            $event = CalendarEvent::for($item, $timeZone);
            // A generated occurrence outside its window is only kept up to date when it already has an event.
            $wanted[$event->key] = new WantedEvent($event, creatable: ! $item->isGenerated() || $item->date >= $occurrencesFrom);
        }

        return $wanted;
    }

    /**
     * The events sent before that this run may touch: those in the window, and those of wanted items (an item moved
     * back into the window from before it). The rest is the past, left alone, so it is not loaded either.
     *
     * @param  list<string>  $wantedKeys
     * @return array<string, GoogleCalendarEvent>
     */
    private function sentEvents(GoogleCalendarConnection $connection, string $windowStart, array $wantedKeys): array
    {
        $sent = $connection->events()->where('date', '>=', $windowStart)->get()->keyBy('key')->all();
        $olderKeys = array_values(array_diff($wantedKeys, array_keys($sent)));

        foreach (array_chunk($olderKeys, 500) as $keys) {
            foreach ($connection->events()->whereIn('key', $keys)->get() as $row) {
                $sent[$row->key] = $row;
            }
        }

        return $sent;
    }

    /**
     * Creates or replaces the event of `$row`.
     *
     * @throws GoogleCalendarDisconnected|GoogleCalendarRateLimited|GoogleCalendarMissing|RequestException|ConnectionException
     */
    private function put(GoogleCalendarConnection $connection, string $calendarId, GoogleCalendarEvent $row, CalendarEvent $event): void
    {
        if ($row->payload_hash === null) {
            // Never confirmed: create it under the id stored for it. A 409 means an earlier attempt got through.
            $done = $this->client->insertEvent($connection, $calendarId, $event->withId($row->google_event_id));
        } else {
            $done = false;
        }

        if (! $done && ! $this->client->updateEvent($connection, $calendarId, $row->google_event_id, $event->withId($row->google_event_id))) {
            // The user deleted it in Google, which keeps the id as cancelled: create it again under a new one.
            $row->update(['google_event_id' => self::newEventId(), 'payload_hash' => null]);
            $this->client->insertEvent($connection, $calendarId, $event->withId($row->google_event_id));
        }

        $row->update(['date' => $event->date, 'payload_hash' => $event->hash()]);
    }

    /**
     * An event id Google accepts (base32hex characters, here hex) that nothing else uses.
     */
    private static function newEventId(): string
    {
        return bin2hex(random_bytes(16));
    }
}
