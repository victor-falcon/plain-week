<?php

namespace App\Mcp\Support;

use App\Tasks\TaskOccurrences;

/**
 * Readable English for the activity log and tool results.
 *
 * @phpstan-import-type Recurrence from TaskOccurrences
 */
final class Describe
{
    private const array WEEKDAYS = [1 => 'Mon', 2 => 'Tue', 3 => 'Wed', 4 => 'Thu', 5 => 'Fri', 6 => 'Sat', 7 => 'Sun'];

    /**
     * "every day", "every 3 days", "every Mon, Wed", "monthly on day 15", plus "until …".
     *
     * @param  Recurrence  $rule
     */
    public static function recurrence(array $rule, Planner $planner): string
    {
        $every = $rule['every'] ?? 1;
        $text = match ($rule['type']) {
            'daily' => $every === 1 ? 'every day' : "every {$every} days",
            'weekly' => 'every '.implode(', ', array_map(fn (int $day) => self::WEEKDAYS[$day] ?? (string) $day, $rule['weekdays'] ?? [])),
            default => 'monthly on day '.($rule['day'] ?? '?'),
        };

        $until = $rule['until'] ?? null;

        return $until === null ? $text : "{$text} until {$planner->dateLabel($until)}";
    }

    /**
     * "1 task", "3 tasks".
     */
    public static function count(int $count, string $noun): string
    {
        return $count.' '.$noun.($count === 1 ? '' : 's');
    }
}
