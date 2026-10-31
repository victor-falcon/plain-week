<?php

namespace App\Push;

use App\Models\User;
use App\Tasks\Occurrence;
use App\Tasks\TaskOccurrences;
use Carbon\CarbonImmutable;

/**
 * Which notifications are due for a user at a moment, in the user's time zone:
 *
 * - Morning: at `notification_morning_time`, one for the day, covering every pending (not done) occurrence of that day
 *   without a time; none when there are none. A timed one gets its reminder instead.
 * - Reminder: five minutes before every pending timed occurrence, also when that is the evening before (a task at
 *   00:03 is reminded at 23:58 the previous day).
 *
 * A moment counts while it lies in the last {@see CATCH_UP_MINUTES} minutes, so a run that is late or skipped still
 * sends it, but nothing is sent long after downtime; a reminder is dropped once its task has started. The caller dedupes
 * across runs ({@see SendDueNotifications}). Wall times that a DST jump skips move forward by the gap; repeated ones
 * count once, at their first instant.
 */
final class DueNotifications
{
    public const int CATCH_UP_MINUTES = 10;

    public const int REMINDER_LEAD_MINUTES = 5;

    public function __construct(private readonly TaskOccurrences $occurrences) {}

    /**
     * @return list<DueNotification>
     */
    public function for(User $user, CarbonImmutable $now): array
    {
        $timezone = $user->timezoneOrDefault();
        $now = $now->setTimezone($timezone);
        $today = $now->startOfDay();
        $due = [];

        $pending = $this->occurrences
            ->forUser($user, $today->subDay(), $today->addDay())
            ->reject(fn (Occurrence $occurrence) => $occurrence->done);

        // Yesterday too: a morning time just before midnight may still be in the catch-up window after it.
        foreach ([$today->subDay(), $today] as $day) {
            $date = $day->toDateString();

            if ($this->isDue(self::at($date, $user->notification_morning_time, $timezone), $now)) {
                $untimed = array_values($pending->where('date', $date)->whereNull('time')->all());

                if ($untimed !== []) {
                    $due[] = DueNotification::morning($date, $untimed);
                }
            }
        }

        foreach ($pending as $occurrence) {
            if ($occurrence->time === null) {
                continue;
            }

            $start = self::at($occurrence->date, $occurrence->time, $timezone);

            if ($start->greaterThan($now) && $this->isDue($start->subMinutes(self::REMINDER_LEAD_MINUTES), $now)) {
                $due[] = DueNotification::reminder($occurrence);
            }
        }

        return $due;
    }

    private function isDue(CarbonImmutable $moment, CarbonImmutable $now): bool
    {
        return $moment->lessThanOrEqualTo($now) && $moment->greaterThan($now->subMinutes(self::CATCH_UP_MINUTES));
    }

    /**
     * A local wall time on a date ('YYYY-MM-DD', 'HH:mm').
     */
    private static function at(string $date, string $time, string $timezone): CarbonImmutable
    {
        return CarbonImmutable::createFromFormat('!Y-m-d H:i', "{$date} {$time}", $timezone)
            ?: throw new \InvalidArgumentException("Invalid date and time: {$date} {$time}.");
    }
}
