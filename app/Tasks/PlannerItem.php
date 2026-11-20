<?php

namespace App\Tasks;

/**
 * A task as the planner sees it (the client's `PlannerTask`): a stored row, or an occurrence generated from a series,
 * with its kind. `$task` has exactly the sync wire shape; for a generated occurrence it is the series' content with
 * the occurrence id, its date, `series_id` and `occurrence_date`, not done.
 *
 * @phpstan-import-type Recurrence from TaskOccurrences
 *
 * @phpstan-type Subtask array{id: string, text: string, done: bool}
 * @phpstan-type TaskRecord array{
 *     id: string,
 *     text: string,
 *     date: string|null,
 *     someday_column: int|null,
 *     position: string,
 *     done: bool,
 *     done_at: string|null,
 *     color: string,
 *     time: string|null,
 *     notes: string,
 *     subtasks: list<Subtask>,
 *     recurrence: Recurrence|null,
 *     series_id: string|null,
 *     occurrence_date: string|null,
 *     created_at: string,
 *     updated_at: string,
 *     deleted_at: string|null,
 * }
 */
final readonly class PlannerItem
{
    /**
     * @param  TaskRecord  $task
     */
    public function __construct(public ItemKind $kind, public array $task) {}

    /**
     * Wraps a row in its view model (the client's `toItem`).
     *
     * @param  TaskRecord  $row
     */
    public static function fromRow(array $row): self
    {
        if ($row['recurrence'] !== null && $row['date'] !== null) {
            return new self(ItemKind::Series, $row);
        }

        if ($row['series_id'] !== null && $row['occurrence_date'] !== null) {
            return new self(ItemKind::Exception, $row);
        }

        return new self(ItemKind::Task, $row);
    }

    /**
     * The occurrence of a series row on `$date` (the client's `makeOccurrence`; it does not check that the rule
     * produces one there).
     *
     * @param  TaskRecord  $series
     */
    public static function occurrence(array $series, string $date): self
    {
        return new self(ItemKind::Occurrence, [
            ...$series,
            'id' => Occurrence::idFor($series['id'], $date),
            'date' => $date,
            'someday_column' => null,
            'done' => false,
            'done_at' => null,
            'recurrence' => null,
            'series_id' => $series['id'],
            'occurrence_date' => $date,
        ]);
    }

    /**
     * Splits an occurrence id (`${seriesId}:${YYYY-MM-DD}`); null for the id of a row. Unlike the client, whose ids
     * come from its own screen, an impossible date (`2026-02-31`) is not an occurrence id, so it never resolves to a
     * day it would overflow to.
     *
     * @return array{seriesId: string, date: string}|null
     */
    public static function parseOccurrenceId(string $id): ?array
    {
        return preg_match('/^(.+):(\d{4}-\d{2}-\d{2})$/', $id, $match) === 1 && RecurrenceRule::isDateKey($match[2])
            ? ['seriesId' => $match[1], 'date' => $match[2]]
            : null;
    }

    public function id(): string
    {
        return $this->task['id'];
    }

    /**
     * The series of an occurrence or exception (a series: itself); null for a plain task.
     */
    public function seriesId(): ?string
    {
        return match ($this->kind) {
            ItemKind::Task => null,
            ItemKind::Series => $this->task['id'],
            default => $this->task['series_id'],
        };
    }

    /**
     * The generated date an occurrence or exception stands for; null for a plain task or a series.
     */
    public function occurrenceDate(): ?string
    {
        return $this->belongsToSeries() ? $this->task['occurrence_date'] : null;
    }

    /**
     * Whether it is an occurrence or an exception: one date of a series.
     */
    public function belongsToSeries(): bool
    {
        return $this->kind === ItemKind::Occurrence || $this->kind === ItemKind::Exception;
    }

    /**
     * True for anything that belongs to a series (the client's `isRecurring`).
     */
    public function isRecurring(): bool
    {
        return $this->kind !== ItemKind::Task;
    }

    /**
     * The wire record plus its `kind`.
     *
     * @return array<string, mixed>
     */
    public function toArray(): array
    {
        return [...$this->task, 'kind' => $this->kind->value];
    }
}
