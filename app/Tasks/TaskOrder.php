<?php

namespace App\Tasks;

use InvalidArgumentException;

/**
 * Ordering and placement of tasks inside a list, a port of the client's `lib/db/position.ts` (and
 * `compareCarryOverOrder` from `lib/db/carry-over.ts`). Positions are fractional-indexing keys
 * ({@see FractionalIndex}).
 *
 * @phpstan-type SortKey array{someday_column: int|null, position: string}
 * @phpstan-type OrderedRow array{id: string, someday_column: int|null, position: string}
 */
final class TaskOrder
{
    /**
     * Sort order inside a day: position, then id as a tie-break.
     *
     * @param  array{id: string, position: string}  $a
     * @param  array{id: string, position: string}  $b
     */
    public static function compareTaskOrder(array $a, array $b): int
    {
        return strcmp($a['position'], $b['position']) ?: strcmp($a['id'], $b['id']);
    }

    /**
     * Sort order of the Someday list: (`someday_column`, `position`, `id`), so rows written when Someday had three
     * columns keep the order they were shown in.
     *
     * @param  OrderedRow  $a
     * @param  OrderedRow  $b
     */
    public static function compareSomedayOrder(array $a, array $b): int
    {
        return (self::somedayColumnOf($a) <=> self::somedayColumnOf($b)) ?: self::compareTaskOrder($a, $b);
    }

    /**
     * Carry-over order: oldest day first, then the order each day had.
     *
     * @param  array{id: string, date: string|null, position: string}  $a
     * @param  array{id: string, date: string|null, position: string}  $b
     */
    public static function compareCarryOverOrder(array $a, array $b): int
    {
        return strcmp($a['date'] ?? '', $b['date'] ?? '') ?: self::compareTaskOrder($a, $b);
    }

    /**
     * A position strictly between `$after` and `$before` (null for the start or the end). If the bounds are not in
     * order (two devices produced the same key, for example) it falls back to a key after `$after`.
     */
    public static function positionBetween(?string $after, ?string $before): string
    {
        try {
            if ($after !== null && $before !== null && strcmp($after, $before) >= 0) {
                return FractionalIndex::between($after, null);
            }

            return FractionalIndex::between($after, $before);
        } catch (InvalidArgumentException $e) {
            throw self::invalidPosition($e);
        }
    }

    /**
     * `$n` positions after `$after`, in order ({@see FractionalIndex::nBetween}).
     *
     * @return list<string>
     */
    public static function positionsAfter(?string $after, int $n): array
    {
        try {
            return FractionalIndex::nBetween($after, null, $n);
        } catch (InvalidArgumentException $e) {
            throw self::invalidPosition($e);
        }
    }

    /**
     * A neighbour's stored position is not a valid key (the push only checks it is a string), which the client cannot
     * place next to either.
     */
    private static function invalidPosition(InvalidArgumentException $e): InvalidTaskChange
    {
        return new InvalidTaskChange("A neighbouring task has an invalid position ({$e->getMessage()}). Move it first.", previous: $e);
    }

    /**
     * A row's Someday column; a missing one (never valid data) counts as 0.
     *
     * @param  array{someday_column: int|null}  $row
     */
    public static function somedayColumnOf(array $row): int
    {
        return $row['someday_column'] ?? 0;
    }

    /**
     * A Someday sort key strictly between two neighbours (null for the start or the end): the column of `$after`
     * with a position after it (and before `$before` when both share that column), else the column of `$before`
     * with a position before it, else column 0. No other row has to change.
     *
     * @param  SortKey|null  $after
     * @param  SortKey|null  $before
     * @return array{someday_column: int, position: string}
     */
    public static function somedayKeyBetween(?array $after, ?array $before): array
    {
        if ($after !== null) {
            $column = self::somedayColumnOf($after);
            $sameColumn = $before !== null && self::somedayColumnOf($before) === $column;

            return [
                'someday_column' => $column,
                'position' => self::positionBetween($after['position'], $sameColumn ? $before['position'] : null),
            ];
        }

        if ($before !== null) {
            return [
                'someday_column' => self::somedayColumnOf($before),
                'position' => self::positionBetween(null, $before['position']),
            ];
        }

        return ['someday_column' => 0, 'position' => self::positionBetween(null, null)];
    }
}
