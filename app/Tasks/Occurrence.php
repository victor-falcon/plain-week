<?php

namespace App\Tasks;

use App\Enums\TaskColor;
use App\Models\Task;

/**
 * One task as the planner shows it on a date: a plain task, an exception row, or an occurrence generated from a series.
 */
final readonly class Occurrence
{
    /**
     * @param  string  $id  The id the client uses: the row id, or `${seriesId}:${date}` for a generated occurrence.
     * @param  string  $taskId  The row behind it: the task itself, the exception row, or the series.
     * @param  string|null  $seriesId  The series it belongs to; null for a plain task.
     * @param  string  $date  'YYYY-MM-DD'.
     * @param  string|null  $time  'HH:mm'.
     */
    public function __construct(
        public string $id,
        public string $taskId,
        public ?string $seriesId,
        public string $date,
        public ?string $time,
        public string $text,
        public string $notes,
        public bool $done,
        public TaskColor $color,
        public string $position,
    ) {}

    /**
     * A plain task or an exception row dated `$task->date`.
     */
    public static function fromRow(Task $task): self
    {
        return new self(
            id: $task->id,
            taskId: $task->id,
            seriesId: $task->series_id,
            date: (string) $task->date,
            time: $task->time,
            text: $task->text,
            notes: $task->notes,
            done: $task->done,
            color: $task->color,
            position: $task->position,
        );
    }

    /**
     * The occurrence a series generates on `$date`: the series' content, not done.
     */
    public static function generated(Task $series, string $date): self
    {
        return new self(
            id: TaskOccurrences::occurrenceId($series->id, $date),
            taskId: $series->id,
            seriesId: $series->id,
            date: $date,
            time: $series->time,
            text: $series->text,
            notes: $series->notes,
            done: false,
            color: $series->color,
            position: $series->position,
        );
    }

    public function isGenerated(): bool
    {
        return $this->id !== $this->taskId;
    }
}
