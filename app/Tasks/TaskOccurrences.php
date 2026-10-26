<?php

namespace App\Tasks;

use App\Models\Task;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Support\Collection;

/**
 * Server port of the client's recurrence expansion (`resources/js/lib/recurrence/expand.ts` and `queryRangeItems` in
 * `resources/js/lib/db/queries.ts`): what a user's planner shows on a range of dates. Both sides must agree, so a change
 * to the rules goes into both, with the same test cases. See docs/architecture.md, "Recurring tasks".
 *
 * @phpstan-type Recurrence array{type: 'daily'|'weekly'|'monthly', every?: int, weekdays?: list<int>, day?: int, until?: string|null}
 */
final class TaskOccurrences
{
    /**
     * Every live item dated `$from`–`$to` (inclusive): plain tasks, exception rows and the occurrences series generate
     * there. Series rows, Someday tasks, tombstones and exceptions that lost to a duplicate are left out. Sorted by
     * date, then like a day in the planner: timed items first by time, then by position, then by id. Done items are
     * included. `$from` and `$to` are taken as calendar dates in their own time zone, so pass them in the user's.
     *
     * @return Collection<int, Occurrence>
     */
    public function forUser(User $user, CarbonImmutable $from, CarbonImmutable $to): Collection
    {
        $first = $from->toDateString();
        $last = $to->toDateString();

        if ($first > $last) {
            return new Collection;
        }

        $rows = Task::query()
            ->where('user_id', $user->id)
            ->whereBetween('date', [$first, $last])
            ->whereNull('recurrence')
            ->whereNull('deleted_at')
            ->get();

        $series = Task::query()
            ->where('user_id', $user->id)
            ->whereNotNull('recurrence')
            ->whereNotNull('date')
            ->where('date', '<=', $last)
            ->whereNull('deleted_at')
            ->get()
            ->filter(fn (Task $task) => ($task->recurrence['until'] ?? $last) >= $first);

        $winners = $this->winningExceptionsFor($user, $rows, $series, $first, $last);
        $winnersBySeries = $winners->groupBy('series_id');
        $items = [];

        foreach ($rows as $row) {
            if (self::isException($row) && $winners->get(self::exceptionKey($row))?->id !== $row->id) {
                continue;
            }

            $items[$row->id] = Occurrence::fromRow($row);
        }

        foreach ($series as $row) {
            foreach (self::expandSeries($row, $winnersBySeries->get($row->id, []), $first, $last) as $item) {
                $items[$item->id] = $item;
            }
        }

        return (new Collection(array_values($items)))
            ->sort(self::compare(...))
            ->values();
    }

    /**
     * What a series contributes to the dates `$first`–`$last` (inclusive): its generated occurrences, except those an
     * exception row replaces, plus its live exceptions that sit in the range. A deleted exception hides its occurrence;
     * of duplicate exceptions only the winner counts. `$exceptions` may contain rows of other series; they are ignored.
     *
     * @param  iterable<Task>  $exceptions
     * @return list<Occurrence>
     */
    public static function expandSeries(Task $series, iterable $exceptions, string $first, string $last): array
    {
        $recurrence = $series->recurrence;

        if ($series->deleted_at !== null || $recurrence === null || $series->date === null) {
            return [];
        }

        $byDate = [];

        foreach ($exceptions as $exception) {
            if (self::isException($exception) && $exception->series_id === $series->id) {
                $byDate[$exception->occurrence_date][] = $exception;
            }
        }

        $winners = array_filter(array_map(self::winningException(...), $byDate));
        $items = [];
        $anchor = self::day($series->date);
        $end = self::day(min($recurrence['until'] ?? $last, $last));

        for ($day = self::day(max($series->date, $first)); $day <= $end; $day = $day->addDay()) {
            $date = $day->toDateString();

            if (self::matchesDay($recurrence, $anchor, $day) && ! isset($winners[$date])) {
                $items[] = Occurrence::generated($series, $date);
            }
        }

        foreach ($winners as $winner) {
            if ($winner->deleted_at === null && $winner->date !== null && $winner->date >= $first && $winner->date <= $last) {
                $items[] = Occurrence::fromRow($winner);
            }
        }

        return $items;
    }

    /**
     * Whether `$date` matches the rule of a series anchored at `$anchor`, ignoring the start and `until`. Only a daily
     * rule counts from the anchor (in calendar days); it never matches before it.
     *
     * @param  Recurrence  $recurrence
     */
    public static function matchesRule(array $recurrence, string $anchor, string $date): bool
    {
        return self::matchesDay($recurrence, self::day($anchor), self::day($date));
    }

    /**
     * The exception row that counts for one occurrence: the newest `updated_at` wins, then the greater id. The server
     * does not keep `(series_id, occurrence_date)` unique, so two offline devices can each write one.
     *
     * @param  iterable<Task>  $rows
     */
    public static function winningException(iterable $rows): ?Task
    {
        $winner = null;

        foreach ($rows as $row) {
            if ($winner === null
                || $row->updated_at->greaterThan($winner->updated_at)
                || ($row->updated_at->equalTo($winner->updated_at) && strcmp($row->id, $winner->id) > 0)) {
                $winner = $row;
            }
        }

        return $winner;
    }

    /**
     * The winning exception (deleted too) of every occurrence that matters here: those the series replace in the range,
     * and those the exception rows dated in the range stand for (their occurrence may lie outside it). Keyed by
     * `exceptionKey`.
     *
     * @param  Collection<int, Task>  $rows
     * @param  Collection<int, Task>  $series
     * @return Collection<string, Task>
     */
    private function winningExceptionsFor(User $user, Collection $rows, Collection $series, string $first, string $last): Collection
    {
        $exceptionRows = $rows->filter(self::isException(...));
        $seriesIds = $series->pluck('id')->merge($exceptionRows->pluck('series_id'))->unique()->values();

        if ($seriesIds->isEmpty()) {
            return new Collection;
        }

        return Task::query()
            ->where('user_id', $user->id)
            ->whereIn('series_id', $seriesIds)
            ->whereNotNull('occurrence_date')
            ->where(fn ($query) => $query
                ->whereBetween('occurrence_date', [$first, $last])
                ->orWhereIn('occurrence_date', $exceptionRows->pluck('occurrence_date')->unique()->values()))
            ->get()
            ->filter(self::isException(...))
            ->groupBy(self::exceptionKey(...))
            ->map(fn (Collection $duplicates) => self::winningException($duplicates))
            ->filter();
    }

    /**
     * Like the client's `toItem`: a row with a series id and an occurrence date that is not a series.
     */
    private static function isException(Task $task): bool
    {
        return $task->series_id !== null
            && $task->occurrence_date !== null
            && ! ($task->recurrence !== null && $task->date !== null);
    }

    private static function exceptionKey(Task $task): string
    {
        return Occurrence::idFor((string) $task->series_id, (string) $task->occurrence_date);
    }

    private static function compare(Occurrence $a, Occurrence $b): int
    {
        if ($a->date !== $b->date) {
            return $a->date <=> $b->date;
        }

        if (($a->time === null) !== ($b->time === null)) {
            return $a->time === null ? 1 : -1;
        }

        return strcmp((string) $a->time, (string) $b->time)
            ?: strcmp($a->position, $b->position)
            ?: strcmp($a->id, $b->id);
    }

    private static function day(string $date): CarbonImmutable
    {
        return CarbonImmutable::createFromFormat('!Y-m-d', $date, 'UTC') ?: throw new \InvalidArgumentException("Invalid date: {$date}.");
    }

    /**
     * `matchesRule` on parsed dates.
     *
     * @param  Recurrence  $recurrence
     */
    private static function matchesDay(array $recurrence, CarbonImmutable $anchor, CarbonImmutable $day): bool
    {
        return match ($recurrence['type']) {
            'daily' => ($days = (int) $anchor->diffInDays($day, false)) >= 0
                && $days % max(1, $recurrence['every'] ?? 1) === 0,
            'weekly' => in_array($day->dayOfWeekIso, $recurrence['weekdays'] ?? [], true),
            // Monthly. Like the client, an unknown type lands here and, without a `day`, matches nothing.
            default => $day->day === min($recurrence['day'] ?? 0, $day->daysInMonth),
        };
    }
}
