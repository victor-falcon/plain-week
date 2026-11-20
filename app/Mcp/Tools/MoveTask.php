<?php

namespace App\Mcp\Tools;

use App\Mcp\Support\Neighbours;
use App\Mcp\Support\Planner;
use App\Mcp\Support\Schemas;
use App\Mcp\Support\TaskOutput;
use App\Mcp\Support\WriteResult;
use Illuminate\Contracts\JsonSchema\JsonSchema;
use Laravel\Mcp\Request;
use Laravel\Mcp\Server\Attributes\Description;
use Laravel\Mcp\Server\Attributes\Name;
use Laravel\Mcp\Server\Tools\Annotations\IsDestructive;
use Laravel\Mcp\Server\Tools\Annotations\IsOpenWorld;

#[Name('move_task')]
#[Description('Moves a task to another day (`date`, `YYYY-MM-DD`) or to Someday (`date: null`), or reorders it within its day: it lands right before `before_id` and/or right after `after_id` (tasks of the target list), or at the end. Moving an occurrence of a recurring task moves only that date: it gets its own id (`kind: "exception"`) and the rest of the series stays. A series itself cannot be moved; move its occurrences, or change its rule with `set_recurrence`.')]
#[IsDestructive(false)]
#[IsOpenWorld(false)]
class MoveTask extends PlannerTool
{
    public function schema(JsonSchema $schema): array
    {
        return [
            'id' => Schemas::id($schema),
            'date' => Schemas::date($schema, 'Target day `YYYY-MM-DD`, or null for Someday.')->nullable()->required(),
            'before_id' => $schema->string()->nullable()->description('Place it right before this task of the target list.'),
            'after_id' => $schema->string()->nullable()->description('Place it right after this task of the target list.'),
        ];
    }

    protected function run(Request $request, Planner $planner): WriteResult
    {
        $validated = $request->validate([
            'id' => ['required', 'string'],
            'date' => ['present', 'nullable', 'date_format:Y-m-d'],
            'before_id' => ['sometimes', 'nullable', 'string', 'different:id'],
            'after_id' => ['sometimes', 'nullable', 'string', 'different:id'],
        ]);

        Neighbours::check($planner, $validated['date'], $validated['before_id'] ?? null, $validated['after_id'] ?? null);

        $item = $planner->tasks->moveTask($validated['id'], $validated['date'], $validated['before_id'] ?? null, $validated['after_id'] ?? null);
        $target = $validated['date'] === null ? 'Someday' : $planner->dateLabel($validated['date']);

        return new WriteResult(
            ['task' => TaskOutput::item($item)],
            'Moved '.TaskOutput::quote($item->task['text'])." to {$target}",
            array_values(array_unique([$validated['id'], $item->id()])),
        );
    }
}
