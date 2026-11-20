<?php

namespace App\Tasks;

/**
 * What an import added.
 *
 * @phpstan-import-type TaskRecord from PlannerItem
 */
final readonly class ImportResult
{
    /**
     * @param  int  $taskCount  Tasks the user sees added: plain tasks plus series.
     * @param  int  $recurringCount  How many of them repeat.
     * @param  list<TaskRecord>  $tasks  The rows written: series first, then plain tasks, then exceptions.
     */
    public function __construct(
        public int $taskCount,
        public int $recurringCount,
        public array $tasks,
    ) {}
}
