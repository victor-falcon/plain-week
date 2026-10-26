<?php

namespace App\Integrations\GoogleCalendar;

use App\Models\GoogleCalendarConnection;
use App\Models\GoogleCalendarEvent;
use App\Models\User;
use App\Tasks\Occurrence;
use App\Tasks\TaskOccurrences;
use Carbon\CarbonImmutable;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\RequestException;

/**
 * Brings a connection's "Plain Week" calendar in line with the planner (one way: Google is never read). It computes
 * the events the planner calls for, compares them with the events it sent before (`google_calendar_events`, by key and
 * payload hash) and creates, updates or deletes only what changed. Every call to Google is saved as it succeeds, so a
 * run cut short (rate limits, a stop) carries on where it was.
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

    public function __construct(
        private readonly GoogleCalendarClient $client,
        private readonly TaskOccurrences $occurrences,
    ) {}

    /**
     * Returns the error of an event Google refused (the others are synced), or null when everything went through.
     *
     * @throws GoogleCalendarDisconnected|GoogleCalendarRateLimited|GoogleCalendarMissing|RequestException|ConnectionException
     */
    public function __invoke(GoogleCalendarConnection $connection): ?string
    {
        $calendarId = $connection->calendar_id;

        if ($connection->isBroken() || $calendarId === null) {
            return null;
        }

        $timeZone = $connection->user->timezoneOrDefault();
        $today = CarbonImmutable::now($timeZone)->startOfDay();
        $windowStart = $today->subDays(self::PAST_DAYS)->toDateString();
        $wanted = $this->wantedEvents($connection->user, $today, $timeZone);
        $error = null;

        /** @var array<string, GoogleCalendarEvent> $sent */
        $sent = $connection->events()->get()->keyBy('key')->all();

        foreach ($sent as $key => $row) {
            if (! isset($wanted[$key]) && $row->date >= $windowStart) {
                $error = $this->refusable(function () use ($connection, $calendarId, $row) {
                    $this->client->deleteEvent($connection, $calendarId, $row->google_event_id);
                    $row->delete();
                }) ?? $error;
            }
        }

        foreach ($wanted as $key => [$event, $creatable]) {
            $row = $sent[$key] ?? null;

            if (($row === null && ! $creatable) || $row?->payload_hash === $event->hash()) {
                continue;
            }

            $row ??= $connection->events()->create([
                'key' => $key,
                'google_event_id' => self::newEventId(),
                'date' => $event->date,
            ]);

            $error = $this->refusable(fn () => $this->put($connection, $calendarId, $row, $event)) ?? $error;
        }

        return $error;
    }

    /**
     * The events the planner calls for, by key, each with whether it may be created (an occurrence a series generates
     * outside its window is only kept up to date when it already has an event).
     *
     * @return array<string, array{CalendarEvent, bool}>
     */
    private function wantedEvents(User $user, CarbonImmutable $today, string $timeZone): array
    {
        $occurrencesFrom = $today->subDays(self::OCCURRENCE_PAST_DAYS)->toDateString();
        $occurrencesTo = $today->addDays(self::OCCURRENCE_FUTURE_DAYS);

        $items = $this->occurrences->forUser($user, $today->subDays(self::PAST_DAYS), $occurrencesTo)
            ->merge($this->occurrences->rowsForUser($user, $occurrencesTo->addDay(), CarbonImmutable::create(9999, 12, 31)));

        $wanted = [];

        foreach ($items as $item) {
            $event = CalendarEvent::for($item, $timeZone);
            $wanted[$event->key] = [$event, ! $item->isGenerated() || $item->date >= $occurrencesFrom];
        }

        return $wanted;
    }

    /**
     * Creates or replaces the event of `$row`. A row Google never confirmed is created with its id (a `409` means an
     * earlier attempt got through: it is replaced instead); an event the user deleted in Google is created again under
     * a new id, since Google keeps the old one as cancelled.
     *
     * @throws GoogleCalendarDisconnected|GoogleCalendarRateLimited|GoogleCalendarMissing|RequestException|ConnectionException
     */
    private function put(GoogleCalendarConnection $connection, string $calendarId, GoogleCalendarEvent $row, CalendarEvent $event): void
    {
        $created = $row->payload_hash === null
            && $this->client->insertEvent($connection, $calendarId, $event->withId($row->google_event_id));

        if (! $created && ! $this->client->updateEvent($connection, $calendarId, $row->google_event_id, $event->withId($row->google_event_id))) {
            $row->update(['google_event_id' => self::newEventId(), 'payload_hash' => null]);
            $this->client->insertEvent($connection, $calendarId, $event->withId($row->google_event_id));
        }

        $row->update(['date' => $event->date, 'payload_hash' => $event->hash()]);
    }

    /**
     * Runs one event call. Google refusing that event (a `4xx` other than the ones the client handles) is reported and
     * returned, so one bad event does not hold back the rest; everything else is thrown.
     *
     * @param  callable(): void  $call
     *
     * @throws GoogleCalendarDisconnected|GoogleCalendarRateLimited|GoogleCalendarMissing|RequestException|ConnectionException
     */
    private function refusable(callable $call): ?string
    {
        try {
            $call();
        } catch (RequestException $e) {
            if (! $e->response->clientError() || $e->response->status() === 401) {
                throw $e;
            }

            report($e);

            return (string) ($e->response->json('error.message') ?? "Google answered {$e->response->status()}.");
        }

        return null;
    }

    /**
     * An event id Google accepts (base32hex characters, here hex) that nothing else uses.
     */
    private static function newEventId(): string
    {
        return bin2hex(random_bytes(16));
    }
}
