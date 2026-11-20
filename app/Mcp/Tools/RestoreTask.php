<?php

namespace App\Mcp\Tools;

use App\Mcp\Support\Planner;
use App\Mcp\Support\Schemas;
use App\Mcp\Support\TaskOutput;
use App\Mcp\Support\WriteResult;
use App\Tasks\InvalidTaskChange;
use App\Tasks\PlannerItem;
use App\Tasks\TaskNotFound;
use Illuminate\Contracts\JsonSchema\JsonSchema;
use Laravel\Mcp\Request;
use Laravel\Mcp\Server\Attributes\Description;
use Laravel\Mcp\Server\Attributes\Name;
use Laravel\Mcp\Server\Tools\Annotations\IsDestructive;
use Laravel\Mcp\Server\Tools\Annotations\IsIdempotent;
use Laravel\Mcp\Server\Tools\Annotations\IsOpenWorld;

#[Name('restore_task')]
#[Description('Brings back a deleted task: the `restore_id` that `delete_task` returned (a task id, or an occurrence id for one deleted date of a recurring task). Restoring a recurring series brings back the series, but not the changed or deleted occurrences that were deleted with it. Fails when the task is not deleted.')]
#[IsDestructive(false)]
#[IsIdempotent]
#[IsOpenWorld(false)]
class RestoreTask extends PlannerTool
{
    public function schema(JsonSchema $schema): array
    {
        return ['id' => Schemas::id($schema, 'The `restore_id` from `delete_task`: a task id, or an occurrence id (`<series id>:<YYYY-MM-DD>`).')];
    }

    protected function run(Request $request, Planner $planner): WriteResult
    {
        $id = $request->validate(['id' => ['required', 'string']])['id'];
        $occurrence = PlannerItem::parseOccurrenceId($id);
        $row = $occurrence === null
            ? $planner->tasks->queries()->row($id)
            : $planner->tasks->queries()->exception($occurrence['seriesId'], $occurrence['date']);

        if ($row === null) {
            throw TaskNotFound::withId($id);
        }

        if ($row['deleted_at'] === null) {
            throw new InvalidTaskChange("Task {$id} is not deleted.");
        }

        $item = $planner->tasks->restoreTask($id);

        return new WriteResult(
            ['task' => TaskOutput::item($item)],
            'Restored '.TaskOutput::quote($item->task['text']).' '.$planner->placeLabel($item->task['date']),
            array_values(array_unique([$id, $item->id()])),
        );
    }
}
