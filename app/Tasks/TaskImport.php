<?php

namespace App\Tasks;

use Closure;
use Illuminate\Validation\ValidationException;

/**
 * Importing a backup (the export file, see "Export format" in docs/architecture.md): a port of the client's
 * `lib/transfer/import.ts` and `rows.ts`. An import ADDS its tasks next to the existing ones, with new ids; nothing
 * that exists changes. {@see TaskRepository::import} writes the plan.
 *
 * @phpstan-import-type TaskRecord from PlannerItem
 */
final class TaskImport
{
    public const string FORMAT = 'plain-week';

    public const int VERSION = 1;

    /**
     * Far above any real planner (10 000 tasks are about 5 MB).
     */
    public const int MAX_BYTES = 50 * 1024 * 1024;

    private const array FIELDS = [
        'id', 'text', 'date', 'someday_column', 'position', 'done', 'done_at', 'color', 'time', 'notes', 'subtasks',
        'recurrence', 'series_id', 'occurrence_date', 'created_at', 'updated_at', 'deleted_at',
    ];

    /**
     * Reads and validates an export file (its JSON, or it decoded): the header, then every task with the push rules
     * (ids only need to be unique strings, since the import replaces them). Unknown keys are dropped.
     *
     * @param  array<mixed>|string  $file
     * @return list<TaskRecord>
     *
     * @throws ImportError
     */
    public static function parse(array|string $file): array
    {
        if (is_string($file)) {
            if (strlen($file) > self::MAX_BYTES) {
                throw new ImportError('This file is too large to import (more than '.(self::MAX_BYTES / 1024 / 1024).' MB).');
            }

            $file = json_decode($file, true);

            if (json_last_error() !== JSON_ERROR_NONE) {
                throw new ImportError('This file is not valid JSON.');
            }
        }

        if (! is_array($file) || ($file['format'] ?? null) !== self::FORMAT) {
            throw new ImportError('This is not a Plain Week export file.');
        }

        $version = $file['version'] ?? null;

        if ($version !== self::VERSION) {
            throw new ImportError(is_int($version) && $version > self::VERSION
                ? "This file comes from a newer version of Plain Week (format version {$version}). Update Plain Week to import it."
                : 'Unsupported export format version: '.json_encode($version).'.');
        }

        if (! is_array($file['tasks'] ?? null) || ! array_is_list($file['tasks'])) {
            throw new ImportError('This file has no task list.');
        }

        $rules = [
            ...TaskRecordRules::rules(''),
            'id' => ['required', 'string'],
            'series_id' => ['present_with:recurrence,occurrence_date', 'nullable', 'string', 'different:id'],
        ];
        $tasks = [];
        $ids = [];

        foreach ($file['tasks'] as $index => $task) {
            $label = 'Task '.($index + 1);

            if (! is_array($task) || ($task !== [] && array_is_list($task))) {
                throw new ImportError("{$label} is not an object.");
            }

            try {
                TaskRecordRules::validate([$task], $rules);
            } catch (ValidationException $e) {
                throw new ImportError("{$label}: {$e->validator->errors()->first()}");
            }

            if (isset($ids[$task['id']])) {
                throw new ImportError("{$label}: \"id\" is used by another task in the file.");
            }

            $ids[$task['id']] = true;
            $row = [];

            foreach (self::FIELDS as $field) {
                $row[$field] = $task[$field] ?? null;
            }

            /** @var TaskRecord $row */
            $tasks[] = $row;
        }

        return $tasks;
    }

    /**
     * The rows worth backing up (the client's `backupRows`): every live row, and of each live series only the
     * exception that counts per occurrence ({@see TaskOccurrences::winningException}), deleted ones included, since a
     * deleted exception is what hides a deleted occurrence. Other tombstones, exceptions of deleted series and losing
     * duplicate exceptions are left out. An exception whose series is missing stays (it imports as a plain task).
     * Export applies it to the database, import again to the file.
     *
     * @param  list<TaskRecord>  $rows
     * @return list<TaskRecord>
     */
    public static function backupRows(array $rows): array
    {
        $seriesDeleted = [];

        foreach ($rows as $row) {
            if ($row['recurrence'] !== null) {
                $seriesDeleted[$row['id']] = $row['deleted_at'] !== null;
            }
        }

        $exceptions = [];
        $result = [];

        foreach ($rows as $row) {
            $deletedSeries = $row['series_id'] === null ? null : ($seriesDeleted[$row['series_id']] ?? null);

            if ($deletedSeries === false) {
                $exceptions["{$row['series_id']}|{$row['occurrence_date']}"][] = $row;
            } elseif ($deletedSeries === null && $row['deleted_at'] === null) {
                // A plain row, a series, or an exception whose series is not here (it imports as a plain task).
                $result[] = $row;
            }
        }

        foreach ($exceptions as $duplicates) {
            $result[] = self::winningException($duplicates);
        }

        return $result;
    }

    /**
     * What an import adds, for a preview: plain tasks plus series, and how many of them repeat. Exceptions of a
     * series in the file are part of it; the others become plain tasks.
     *
     * @param  list<TaskRecord>  $tasks
     * @return array{taskCount: int, recurringCount: int}
     */
    public static function summarize(array $tasks): array
    {
        $rows = self::backupRows($tasks);
        $series = self::seriesIds($rows);
        $visible = array_filter($rows, fn (array $task) => $task['deleted_at'] === null
            && ($task['series_id'] === null || ! isset($series[$task['series_id']])));

        return ['taskCount' => count($visible), 'recurringCount' => count($series)];
    }

    /**
     * The rows to add (the client's `planImport`): new ids (series first, so their ids sort and sync before their
     * exceptions), `series_id` remapped to the new series (an exception whose series is not in the file becomes a
     * plain task), positions appended after the existing rows of each day / the Someday list in the file's order
     * (Someday tasks take the column of the last Someday task, 0 when there is none), and `$now` as `created_at` and
     * `updated_at` (`deleted_at` too for a kept exception tombstone). `done`, `done_at` and subtasks are kept.
     *
     * @param  list<TaskRecord>  $tasks  Parsed rows ({@see parse}).
     * @param  Closure(): string  $newId
     */
    public static function plan(array $tasks, TaskQueries $queries, string $now, Closure $newId): ImportResult
    {
        $summary = self::summarize($tasks);
        $kept = self::backupRows($tasks);
        $series = self::seriesIds($kept);
        $kindOrder = fn (array $task) => $task['recurrence'] !== null ? 0 : ($task['series_id'] === null ? 1 : 2);

        $rows = array_map(
            fn (array $task) => $task['series_id'] === null || isset($series[$task['series_id']])
                ? $task
                : [...$task, 'series_id' => null, 'occurrence_date' => null],
            $kept,
        );
        // usort is stable, like Array.prototype.sort.
        usort($rows, fn (array $a, array $b) => $kindOrder($a) <=> $kindOrder($b));

        $newIds = [];
        $byList = [];

        foreach ($rows as $task) {
            $newIds[$task['id']] = $newId();
            $byList[$task['date'] ?? ''][] = $task;
        }

        $sortKeys = [];

        foreach ($byList as $key => $list) {
            $isSomeday = $key === '';
            $end = $queries->listEnd($isSomeday ? null : (string) $key);
            usort($list, $isSomeday ? TaskOrder::compareSomedayOrder(...) : TaskOrder::compareTaskOrder(...));
            $positions = TaskOrder::positionsAfter($end['position'] ?? null, count($list));

            foreach ($list as $i => $task) {
                $sortKeys[$task['id']] = [
                    'someday_column' => $isSomeday ? ($end === null ? 0 : TaskOrder::somedayColumnOf($end)) : $task['someday_column'],
                    'position' => $positions[$i],
                ];
            }
        }

        $planned = array_map(fn (array $task) => [
            ...$task,
            'id' => $newIds[$task['id']],
            ...$sortKeys[$task['id']],
            'series_id' => $task['series_id'] === null ? null : $newIds[$task['series_id']],
            'created_at' => $now,
            'updated_at' => $now,
            'deleted_at' => $task['deleted_at'] === null ? null : $now,
        ], $rows);

        return new ImportResult($summary['taskCount'], $summary['recurringCount'], $planned);
    }

    /**
     * @param  list<TaskRecord>  $rows
     * @return array<string, true>
     */
    private static function seriesIds(array $rows): array
    {
        $ids = [];

        foreach ($rows as $row) {
            if ($row['recurrence'] !== null) {
                $ids[$row['id']] = true;
            }
        }

        return $ids;
    }

    /**
     * {@see TaskOccurrences::winningException} on wire records: the newest `updated_at` wins, then the greater id.
     *
     * @param  non-empty-list<TaskRecord>  $rows
     * @return TaskRecord
     */
    private static function winningException(array $rows): array
    {
        $winner = $rows[0];

        foreach ($rows as $row) {
            $order = strcmp($row['updated_at'], $winner['updated_at']);

            if ($order > 0 || ($order === 0 && strcmp($row['id'], $winner['id']) > 0)) {
                $winner = $row;
            }
        }

        return $winner;
    }
}
