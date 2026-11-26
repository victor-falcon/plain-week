<?php

namespace App\Integrations\Calendar;

use App\Tasks\Occurrence;
use Carbon\CarbonImmutable;
use Illuminate\Support\Str;

/**
 * What a calendar shows for one planner item, whatever the calendar (Google Calendar, the ICS feed): all day on its
 * date, or {@see self::TIMED_MINUTES} minutes from its time in the user's time zone, with a link back to the task.
 */
final readonly class PlannerEvent
{
    /** How long a timed task's event lasts. */
    public const int TIMED_MINUTES = 20;

    /**
     * Google refuses an event whose description is too long (about 8 KB), so long notes are cut; in every calendar, so
     * they all show the same.
     */
    private const int NOTES_LIMIT = 6000;

    private const int TEXT_LIMIT = 1000;

    /**
     * @param  string  $key  What identifies the item across edits and moves (see {@see self::keyFor}).
     * @param  string  $date  'YYYY-MM-DD'.
     * @param  CarbonImmutable|null  $start  In the user's time zone; null for an all-day event.
     * @param  CarbonImmutable|null  $end  In the user's time zone; null for an all-day event.
     */
    private function __construct(
        public string $key,
        public string $date,
        public string $summary,
        public string $description,
        public string $link,
        public ?CarbonImmutable $start,
        public ?CarbonImmutable $end,
    ) {}

    public static function for(Occurrence $item, string $timeZone): self
    {
        $link = url('/').'/?task='.rawurlencode($item->id);
        $start = self::start($item, $timeZone);

        return new self(
            key: self::keyFor($item),
            date: $item->date,
            summary: ($item->done ? '✅' : '🎯').' '.Str::limit($item->text, self::TEXT_LIMIT),
            description: ltrim(Str::limit(trim($item->notes), self::NOTES_LIMIT)."\n\nOpen in Plain Week: {$link}"),
            link: $link,
            start: $start,
            end: $start?->addMinutes(self::TIMED_MINUTES),
        );
    }

    /**
     * A plain task is its row; an occurrence of a series is `(series, occurrence date)`, which stays the same when an
     * edit turns it into an exception row (with a new id) or moves it.
     */
    public static function keyFor(Occurrence $item): string
    {
        return $item->seriesId !== null && $item->occurrenceDate !== null
            ? Occurrence::idFor($item->seriesId, $item->occurrenceDate)
            : $item->taskId;
    }

    /**
     * The day after an all-day event (calendars take its end as exclusive).
     */
    public function dayAfter(): string
    {
        $day = CarbonImmutable::createFromFormat('!Y-m-d', $this->date, 'UTC') ?: throw new \InvalidArgumentException("Invalid date: {$this->date}.");

        return $day->addDay()->toDateString();
    }

    private static function start(Occurrence $item, string $timeZone): ?CarbonImmutable
    {
        if ($item->time === null) {
            return null;
        }

        // A time that does not exist on the day clocks go forward lands on the hour after, like Google does.
        return CarbonImmutable::createFromFormat('!Y-m-d H:i', "{$item->date} {$item->time}", $timeZone)
            ?: throw new \InvalidArgumentException("Invalid date or time: {$item->date} {$item->time}.");
    }
}
