<?php

namespace App\Mcp\Tools;

use App\Mcp\Support\Planner;
use App\Mcp\Support\Schemas;
use App\Mcp\Support\TaskOutput;
use App\Mcp\Support\WriteResult;
use App\Tasks\ItemKind;
use App\Tasks\Scope;
use App\Tasks\TaskNotFound;
use Illuminate\Contracts\JsonSchema\JsonSchema;
use Laravel\Mcp\Request;
use Laravel\Mcp\Server\Attributes\Description;
use Laravel\Mcp\Server\Attributes\Name;
use Laravel\Mcp\Server\Tools\Annotations\IsDestructive;
use Laravel\Mcp\Server\Tools\Annotations\IsOpenWorld;

#[Name('delete_task')]
#[Description('Deletes a task. On an occurrence of a recurring task, scope `this` (default) deletes only that date and `future` ends the series the day before (from its first date: the whole series). A series id deletes the whole series with every changed occurrence. A plain task, a single occurrence or a whole series can be brought back with `restore_task` and the `restore_id` returned (restoring a series does not bring back its changed occurrences); ending a series with `future` is undone by extending its rule with `set_recurrence`.')]
#[IsDestructive]
#[IsOpenWorld(false)]
class DeleteTask extends PlannerTool
{
    public function schema(JsonSchema $schema): array
    {
        return [
            'id' => Schemas::id($schema),
            'scope' => Schemas::scope($schema, Scope::This),
        ];
    }

    protected function run(Request $request, Planner $planner): WriteResult
    {
        $validated = $request->validate(['id' => ['required', 'string'], ...Schemas::scopeRules()]);
        $scope = Scope::from($validated['scope'] ?? Scope::This->value);
        $item = $planner->tasks->findTask($validated['id']) ?? throw TaskNotFound::withId($validated['id']);
        $row = $planner->tasks->deleteTask($validated['id'], $scope);
        $text = TaskOutput::quote($item->task['text']);
        $ended = $item->belongsToSeries() && $scope === Scope::Future;
        // Ending a series keeps it (with an `until`); only a tombstone can be restored.
        $restoreId = $row['deleted_at'] === null ? null : ($item->kind === ItemKind::Occurrence ? $item->id() : $row['id']);

        $summary = match (true) {
            $ended => "Deleted {$text} from ".$planner->dateLabel($item->occurrenceDate()).' on',
            $item->kind === ItemKind::Series => "Deleted the recurring task {$text}",
            $item->belongsToSeries() => "Deleted {$text} on ".$planner->dateLabel($item->occurrenceDate()),
            default => "Deleted {$text}",
        };

        return new WriteResult(
            [
                'deleted' => TaskOutput::item($item),
                'scope' => $item->belongsToSeries() ? $scope->value : null,
                'restore_id' => $restoreId,
                'series' => $ended && $row['deleted_at'] === null ? TaskOutput::row($row) : null,
            ],
            $summary,
            array_values(array_unique(array_filter([$item->id(), $row['id'], $item->seriesId()]))),
        );
    }
}
