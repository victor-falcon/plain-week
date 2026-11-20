<?php

namespace App\Mcp\Support;

use App\Models\User;
use App\Tasks\TaskRepository;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\Date;

/**
 * What a planner tool works with: the signed-in user, their task repository and "today" in their time zone (every
 * date the tools read or write is a calendar date there).
 */
final readonly class Planner
{
    public TaskRepository $tasks;

    public string $timezone;

    public function __construct(public User $user)
    {
        $this->tasks = TaskRepository::for($user);
        $this->timezone = $user->timezoneOrDefault();
    }

    public function now(): CarbonImmutable
    {
        return CarbonImmutable::instance(Date::now($this->timezone));
    }

    public function today(): string
    {
        return $this->now()->toDateString();
    }

    /**
     * The Monday of the current week (the user's), `YYYY-MM-DD`.
     */
    public function weekStart(): string
    {
        return $this->now()->startOfWeek(CarbonImmutable::MONDAY)->toDateString();
    }

    /**
     * A date for summaries, like "Mon 23 Nov" ("Mon 23 Nov 2027" outside the current year); null is "Someday".
     */
    public function dateLabel(?string $date): string
    {
        if ($date === null) {
            return 'Someday';
        }

        $day = CarbonImmutable::createFromFormat('!Y-m-d', $date, $this->timezone) ?: null;

        if ($day === null) {
            return $date;
        }

        return $day->format($day->year === $this->now()->year ? 'D j M' : 'D j M Y');
    }

    /**
     * Where a task is, for summaries: "on Mon 23 Nov" or "in Someday".
     */
    public function placeLabel(?string $date): string
    {
        return $date === null ? 'in Someday' : 'on '.$this->dateLabel($date);
    }
}
