<?php

namespace App\Mcp\Support;

use App\Tasks\ItemKind;
use App\Tasks\PlannerItem;

/**
 * The compact shape tools return for a task: what an agent needs to read and change it, without sync bookkeeping
 * (positions, timestamps, versions). `kind` tells a plain task, a series, a generated occurrence (id
 * `<series id>:<YYYY-MM-DD>`, no row of its own yet) and an exception (an occurrence that was changed, with its own
 * id). Occurrences and exceptions carry their `series_id` and `occurrence_date`; a series carries its `recurrence`.
 *
 * @phpstan-import-type TaskRecord from PlannerItem
 */
final class TaskOutput
{
    /**
     * @return array<string, mixed>
     */
    public static function item(PlannerItem $item): array
    {
        $task = $item->task;
        $output = [
            'id' => $task['id'],
            'kind' => $item->kind->value,
            'text' => $task['text'],
            'date' => $task['date'],
            'done' => $task['done'],
            'color' => $task['color'],
            'time' => $task['time'],
            'notes' => $task['notes'],
            'subtasks' => $task['subtasks'],
        ];

        if ($item->kind === ItemKind::Series) {
            $output['recurrence'] = $task['recurrence'];
        }

        if ($item->belongsToSeries()) {
            $output['series_id'] = $task['series_id'];
            $output['occurrence_date'] = $task['occurrence_date'];
        }

        return $output;
    }

    /**
     * @param  TaskRecord  $row
     * @return array<string, mixed>
     */
    public static function row(array $row): array
    {
        return self::item(PlannerItem::fromRow($row));
    }

    /**
     * @param  iterable<PlannerItem>  $items
     * @return list<array<string, mixed>>
     */
    public static function items(iterable $items): array
    {
        $output = [];

        foreach ($items as $item) {
            $output[] = self::item($item);
        }

        return $output;
    }

    /**
     * A task's text for summaries: quoted, shortened when long.
     */
    public static function quote(string $text): string
    {
        $text = trim(preg_replace('/\s+/', ' ', $text) ?? $text);

        return '“'.mb_strimwidth($text === '' ? 'Untitled' : $text, 0, 60, '…').'”';
    }
}
