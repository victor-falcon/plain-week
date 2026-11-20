<?php

namespace App\Tasks;

use Carbon\CarbonImmutable;

/**
 * Repeat-rule helpers of the client's `lib/recurrence/expand.ts` that the mutations need (matching itself is
 * {@see TaskOccurrences::matchesRule}), on `YYYY-MM-DD` keys with UTC arithmetic.
 *
 * @phpstan-import-type Recurrence from TaskOccurrences
 */
final class RecurrenceRule
{
    /**
     * Validates a rule and puts it in the contract's canonical form (weekdays unique and sorted, `until` only when
     * set), like the client's `normalizeRecurrence`, so push validation never refuses it.
     *
     * @param  array<string, mixed>  $recurrence
     * @return Recurrence
     *
     * @throws InvalidTaskChange
     */
    public static function normalize(array $recurrence, string $anchorDate): array
    {
        $until = $recurrence['until'] ?? null;

        if ($until !== null && (! is_string($until) || ! self::isDateKey($until) || $until < $anchorDate)) {
            throw new InvalidTaskChange('Invalid until date: '.json_encode($until).'.');
        }

        $end = $until === null ? [] : ['until' => $until];
        $type = $recurrence['type'] ?? null;

        if ($type === 'daily') {
            $every = $recurrence['every'] ?? null;

            if (! is_int($every) || $every < 1 || $every > TaskRecordRules::MAX_EVERY_DAYS) {
                throw new InvalidTaskChange('A daily rule needs a number of days from 1 to '.TaskRecordRules::MAX_EVERY_DAYS.'.');
            }

            return ['type' => 'daily', 'every' => $every, ...$end];
        }

        if ($type === 'weekly') {
            $weekdays = $recurrence['weekdays'] ?? null;
            $valid = is_array($weekdays) && $weekdays !== []
                && array_all($weekdays, fn ($day) => is_int($day) && $day >= 1 && $day <= 7);

            if (! $valid) {
                throw new InvalidTaskChange('A weekly rule needs ISO weekdays from 1 to 7.');
            }

            /** @var list<int> $weekdays */
            $weekdays = array_values(array_unique($weekdays));
            sort($weekdays);

            return ['type' => 'weekly', 'weekdays' => $weekdays, ...$end];
        }

        $day = $recurrence['day'] ?? null;

        if ($type !== 'monthly' || ! is_int($day) || $day < 1 || $day > 31) {
            throw new InvalidTaskChange('A monthly rule needs a day from 1 to 31.');
        }

        return ['type' => 'monthly', 'day' => $day, ...$end];
    }

    /**
     * Whether a series anchored at `$anchor` generates an occurrence on `$date` (its start and `until` included).
     *
     * @param  Recurrence  $recurrence
     */
    public static function occursOn(array $recurrence, string $anchor, string $date): bool
    {
        $until = $recurrence['until'] ?? null;

        return $date >= $anchor
            && ($until === null || $date <= $until)
            && TaskOccurrences::matchesRule($recurrence, $anchor, $date);
    }

    /**
     * The first date from `$anchor` on that the rule produces, or null when it ends before one (a daily rule matches
     * the anchor itself; the others match within two months).
     *
     * @param  Recurrence  $recurrence
     */
    public static function firstDate(array $recurrence, string $anchor): ?string
    {
        $until = $recurrence['until'] ?? null;

        for ($day = $anchor, $i = 0; $i < 62; $day = self::addDays($day, 1), $i++) {
            if ($until !== null && $day > $until) {
                return null;
            }

            if (TaskOccurrences::matchesRule($recurrence, $anchor, $day)) {
                return $day;
            }
        }

        return null;
    }

    /**
     * Whether `$date` is on or before the series' first occurrence: a change from there is a change to the whole
     * series.
     *
     * @param  Recurrence  $recurrence
     */
    public static function startsSeries(array $recurrence, string $anchor, string $date): bool
    {
        return $date <= (self::firstDate($recurrence, $anchor) ?? $anchor);
    }

    public static function addDays(string $date, int $days): string
    {
        $day = CarbonImmutable::createFromFormat('!Y-m-d', $date, 'UTC') ?: throw new InvalidTaskChange("Invalid date: {$date}.");

        return $day->addDays($days)->toDateString();
    }

    /**
     * A real calendar day in `YYYY-MM-DD`.
     */
    public static function isDateKey(string $value): bool
    {
        return preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $value, $match) === 1
            && checkdate((int) $match[2], (int) $match[3], (int) $match[1]);
    }
}
