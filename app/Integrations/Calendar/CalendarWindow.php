<?php

namespace App\Integrations\Calendar;

use App\Models\User;
use App\Tasks\Occurrence;
use App\Tasks\TaskOccurrences;
use Carbon\CarbonImmutable;
use Illuminate\Support\Collection;

/**
 * Which planner items a calendar shows (Google Calendar, the ICS feed): dated tasks and exception rows from
 * {@see self::PAST_DAYS} days ago on, with no limit ahead; occurrences a series generates only from
 * {@see self::OCCURRENCE_PAST_DAYS} days ago to {@see self::OCCURRENCE_FUTURE_DAYS} days ahead, so the window moves with
 * the days. Someday tasks, tombstones and series rows are never in it.
 */
final readonly class CalendarWindow
{
    public const int PAST_DAYS = 30;

    public const int OCCURRENCE_PAST_DAYS = 7;

    public const int OCCURRENCE_FUTURE_DAYS = 60;

    /** The end of "no limit ahead" for dated rows. */
    private const string LAST_DATE = '9999-12-31';

    public function __construct(private TaskOccurrences $occurrences) {}

    /**
     * Every item from {@see self::PAST_DAYS} days before `$today` on, sorted like the planner. Generated occurrences
     * older than {@see self::OCCURRENCE_PAST_DAYS} days are in it too (Google keeps their events up to date): see
     * {@see self::isFresh}.
     *
     * @param  CarbonImmutable  $today  The start of today in the user's time zone.
     * @return Collection<int, Occurrence>
     */
    public function items(User $user, CarbonImmutable $today): Collection
    {
        $occurrencesTo = $today->addDays(self::OCCURRENCE_FUTURE_DAYS);

        return $this->occurrences->forUser($user, $today->subDays(self::PAST_DAYS), $occurrencesTo)
            ->merge($this->occurrences->rowsForUser($user, $occurrencesTo->addDay(), CarbonImmutable::parse(self::LAST_DATE)));
    }

    /**
     * False for a generated occurrence older than {@see self::OCCURRENCE_PAST_DAYS} days: a calendar does not add it.
     */
    public static function isFresh(Occurrence $item, CarbonImmutable $today): bool
    {
        return ! $item->isGenerated() || $item->date >= $today->subDays(self::OCCURRENCE_PAST_DAYS)->toDateString();
    }
}
