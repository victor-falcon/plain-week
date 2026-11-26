<?php

namespace App\Integrations\IcsFeed;

use App\Integrations\Calendar\CalendarWindow;
use App\Integrations\Calendar\PlannerEvent;
use App\Models\User;
use Carbon\CarbonImmutable;

/**
 * A user's planner as an iCalendar document, for calendar apps that subscribe to a URL (Apple Calendar, Outlook…). It
 * holds the items of {@see CalendarWindow}, one VEVENT each (no RRULE), like the Google Calendar sync. Timed events are
 * written in UTC, computed in the user's time zone, so no VTIMEZONE is needed and DST days are right.
 */
final readonly class IcsCalendar
{
    public const string NAME = 'Plain Week';

    /** How often calendar apps should fetch the feed again. */
    public const string REFRESH_INTERVAL = 'PT15M';

    public function __construct(private CalendarWindow $window) {}

    public function __invoke(User $user): string
    {
        $timeZone = $user->timezoneOrDefault();
        $now = CarbonImmutable::now();
        $today = $now->setTimezone($timeZone)->startOfDay();
        $host = (string) parse_url(url('/'), PHP_URL_HOST);

        $ics = (new IcsWriter)
            ->begin('VCALENDAR')
            ->raw('VERSION', '2.0')
            ->text('PRODID', '-//Plain Week//Plain Week//EN')
            ->raw('CALSCALE', 'GREGORIAN')
            ->raw('METHOD', 'PUBLISH')
            ->text('X-WR-CALNAME', self::NAME)
            ->text('X-WR-TIMEZONE', $timeZone)
            ->raw('REFRESH-INTERVAL;VALUE=DURATION', self::REFRESH_INTERVAL)
            ->raw('X-PUBLISHED-TTL', self::REFRESH_INTERVAL);

        $events = [];

        foreach ($this->window->items($user, $today) as $item) {
            // A feed has no memory of what it sent, so unlike Google an occurrence that is no longer fresh just goes.
            if (CalendarWindow::isFresh($item, $today)) {
                $event = PlannerEvent::for($item, $timeZone);
                // One event per key, like Google: two with the same UID would make a broken feed.
                $events[$event->key] = $event;
            }
        }

        foreach ($events as $event) {
            self::event($ics, $event, $host, $now);
        }

        return $ics->end('VCALENDAR')->toString();
    }

    /**
     * The UID calendar apps match events by: stable across edits and moves, so they update an event instead of adding
     * another. Task ids are unique across accounts.
     */
    private static function uid(PlannerEvent $event, string $host): string
    {
        return "{$event->key}@{$host}";
    }

    private static function event(IcsWriter $ics, PlannerEvent $event, string $host, CarbonImmutable $now): void
    {
        $ics->begin('VEVENT')
            ->text('UID', self::uid($event, $host))
            ->utc('DTSTAMP', $now);

        if ($event->start === null || $event->end === null) {
            // A task on a day does not make the user busy all day.
            $ics->date('DTSTART', $event->date)->date('DTEND', $event->dayAfter())->raw('TRANSP', 'TRANSPARENT');
        } else {
            $ics->utc('DTSTART', $event->start)->utc('DTEND', $event->end);
        }

        // No VALARM: Plain Week sends its own notifications.
        $ics->text('SUMMARY', $event->summary)
            ->text('DESCRIPTION', $event->description)
            ->raw('URL', $event->link)
            ->raw('STATUS', 'CONFIRMED')
            ->end('VEVENT');
    }
}
