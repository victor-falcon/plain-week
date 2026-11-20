<?php

namespace App\Tasks;

use App\Models\Task;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;

/**
 * One user's planner as the client's `lib/db/queries.ts` reads it: items by id (occurrence ids included), the list of
 * a day or of Someday, and the rows behind a series. Records have the sync wire shape. Mutations
 * ({@see TaskRepository}) read through it inside their transaction.
 *
 * @phpstan-import-type TaskRecord from PlannerItem
 */
final class TaskQueries
{
    public function __construct(private readonly User $user) {}

    /**
     * A live item by id, or null when it does not exist or was deleted. The id may be a row id or an occurrence id;
     * an occurrence that has an exception row resolves to that row (null when it is deleted), and a losing duplicate
     * exception resolves to null.
     */
    public function find(string $id): ?PlannerItem
    {
        $occurrence = PlannerItem::parseOccurrenceId($id);

        if ($occurrence === null) {
            $row = $this->row($id);

            if ($row === null || $row['deleted_at'] !== null) {
                return null;
            }

            $item = PlannerItem::fromRow($row);

            return $this->shown([$item]) === [] ? null : $item;
        }

        $series = $this->series($occurrence['seriesId']);

        if ($series === null) {
            return null;
        }

        $exception = $this->exception($series['id'], $occurrence['date']);

        if ($exception !== null) {
            return $exception['deleted_at'] === null ? PlannerItem::fromRow($exception) : null;
        }

        /** @var array{type: 'daily'|'weekly'|'monthly', every?: int, weekdays?: list<int>, day?: int, until?: string|null} $rule */
        $rule = $series['recurrence'];

        return RecurrenceRule::occursOn($rule, (string) $series['date'], $occurrence['date'])
            ? PlannerItem::occurrence($series, $occurrence['date'])
            : null;
    }

    /**
     * A row of the user by id, deleted or not.
     *
     * @return TaskRecord|null
     */
    public function row(string $id): ?array
    {
        return $this->tasks()->whereKey($id)->first()?->toRecord();
    }

    /**
     * A live series row, or null.
     *
     * @return TaskRecord|null
     */
    public function series(string $id): ?array
    {
        $row = $this->row($id);

        return $row !== null && $row['deleted_at'] === null && PlannerItem::fromRow($row)->kind === ItemKind::Series
            ? $row
            : null;
    }

    /**
     * Every exception row (deleted too) of a series whose occurrence date is `$from`–`$to`.
     *
     * @return list<TaskRecord>
     */
    public function exceptions(string $seriesId, string $from = '0000-01-01', string $to = '9999-12-31'): array
    {
        return array_values($this->tasks()
            ->where('series_id', $seriesId)
            ->whereBetween('occurrence_date', [$from, $to])
            ->get()
            ->map(fn (Task $task) => $task->toRecord())
            ->all());
    }

    /**
     * The exception row that counts for one occurrence (deleted too), or null. Duplicates can arrive through sync;
     * see {@see TaskOccurrences::winningException}.
     *
     * @return TaskRecord|null
     */
    public function exception(string $seriesId, string $date): ?array
    {
        $rows = $this->tasks()->where('series_id', $seriesId)->where('occurrence_date', $date)->get();

        return TaskOccurrences::winningException($rows)?->toRecord();
    }

    /**
     * Live items of one day in position order, or of the Someday list in its order (`$date` null; archived tasks
     * included). Series rows are never listed; a day includes the occurrences its series generate.
     *
     * @return list<PlannerItem>
     */
    public function listIn(?string $date): array
    {
        if ($date === null) {
            $items = $this->shown($this->liveItems(
                $this->tasks()->whereNull('date')->whereIn('someday_column', [0, 1, 2])->get(),
            ));

            usort($items, fn (PlannerItem $a, PlannerItem $b) => TaskOrder::compareSomedayOrder($a->task, $b->task));

            return $items;
        }

        $items = $this->rangeItems($date, $date);

        usort($items, fn (PlannerItem $a, PlannerItem $b) => TaskOrder::compareTaskOrder($a->task, $b->task));

        return $items;
    }

    /**
     * Live items dated `$first`–`$last` (inclusive), unsorted: plain tasks, exceptions and the occurrences series
     * generate there. Series rows themselves are left out.
     *
     * @return list<PlannerItem>
     */
    public function rangeItems(string $first, string $last): array
    {
        $items = [];

        foreach ($this->shown($this->liveItems($this->tasks()->whereBetween('date', [$first, $last])->get())) as $item) {
            $items[$item->id()] = $item;
        }

        $series = $this->tasks()
            ->whereNotNull('recurrence')
            ->whereNotNull('date')
            ->where('date', '<=', $last)
            ->whereNull('deleted_at')
            ->get()
            ->filter(fn (Task $task) => ($task->recurrence['until'] ?? $first) >= $first);

        if ($series->isNotEmpty()) {
            $exceptions = $this->tasks()
                ->whereIn('series_id', $series->pluck('id'))
                ->whereBetween('occurrence_date', [$first, $last])
                ->get();
            $byId = $exceptions->keyBy('id');

            foreach ($series as $row) {
                foreach (TaskOccurrences::expandSeries($row, $exceptions, $first, $last) as $occurrence) {
                    $item = $occurrence->isGenerated()
                        ? PlannerItem::occurrence($row->toRecord(), $occurrence->date)
                        : PlannerItem::fromRow($byId->get($occurrence->taskId)?->toRecord() ?? $row->toRecord());
                    $items[$item->id()] = $item;
                }
            }
        }

        return array_values($items);
    }

    /**
     * The sort key of the last row of a day (any row dated there, by position then id) or of the Someday list (by
     * its order), deleted rows included; null when there is none. Imports append after it.
     *
     * @return array{id: string, someday_column: int|null, position: string}|null
     */
    public function listEnd(?string $date): ?array
    {
        $rows = $date === null
            ? $this->tasks()->whereNull('date')->whereIn('someday_column', [0, 1, 2])
            : $this->tasks()->where('date', $date);
        $end = null;

        // Compared in PHP: positions are case sensitive, and a database collation may not be.
        foreach ($rows->get(['id', 'someday_column', 'position']) as $row) {
            $key = ['id' => $row->id, 'someday_column' => $row->someday_column, 'position' => $row->position];
            if ($end === null || ($date === null ? TaskOrder::compareSomedayOrder($key, $end) : TaskOrder::compareTaskOrder($key, $end)) > 0) {
                $end = $key;
            }
        }

        return $end;
    }

    /**
     * @return Builder<Task>
     */
    private function tasks(): Builder
    {
        return Task::query()->where('user_id', $this->user->id);
    }

    /**
     * Live rows as items, without series rows.
     *
     * @param  Collection<int, Task>  $rows
     * @return list<PlannerItem>
     */
    private function liveItems(Collection $rows): array
    {
        return array_values($rows
            ->filter(fn (Task $task) => $task->deleted_at === null)
            ->map(fn (Task $task) => PlannerItem::fromRow($task->toRecord()))
            ->reject(fn (PlannerItem $item) => $item->kind === ItemKind::Series)
            ->all());
    }

    /**
     * `$items` without the exception rows that lost to a duplicate of their occurrence.
     *
     * @param  list<PlannerItem>  $items
     * @return list<PlannerItem>
     */
    private function shown(array $items): array
    {
        $exceptions = array_filter($items, fn (PlannerItem $item) => $item->kind === ItemKind::Exception);

        if ($exceptions === []) {
            return $items;
        }

        $key = fn (?string $seriesId, ?string $date) => "{$seriesId}|{$date}";
        $winners = $this->tasks()
            ->whereIn('series_id', array_unique(array_map(fn (PlannerItem $item) => $item->task['series_id'], $exceptions)))
            ->whereIn('occurrence_date', array_unique(array_map(fn (PlannerItem $item) => $item->task['occurrence_date'], $exceptions)))
            ->get()
            ->groupBy(fn (Task $task) => $key($task->series_id, $task->occurrence_date))
            ->map(fn (Collection $rows) => TaskOccurrences::winningException($rows)?->id);

        return array_values(array_filter($items, fn (PlannerItem $item) => $item->kind !== ItemKind::Exception
            || $winners->get($key($item->task['series_id'], $item->task['occurrence_date'])) === $item->id()));
    }
}
