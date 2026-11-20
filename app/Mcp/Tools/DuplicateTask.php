<?php

namespace App\Mcp\Tools;

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

#[Name('duplicate_task')]
#[Description('Copies a task right after the original, on the same day (or in Someday): same text, color, time, notes, subtasks and done state, with new ids. The copy is always a plain, non-repeating task, also when the original is an occurrence of a recurring task. Returns the copy.')]
#[IsDestructive(false)]
#[IsOpenWorld(false)]
class DuplicateTask extends PlannerTool
{
    public function schema(JsonSchema $schema): array
    {
        return ['id' => Schemas::id($schema)];
    }

    protected function run(Request $request, Planner $planner): WriteResult
    {
        $id = $request->validate(['id' => ['required', 'string']])['id'];
        $copy = $planner->tasks->duplicateTask($id);

        return new WriteResult(
            ['task' => TaskOutput::row($copy)],
            'Duplicated '.TaskOutput::quote($copy['text']).' '.$planner->placeLabel($copy['date']),
            [$id, $copy['id']],
        );
    }
}
