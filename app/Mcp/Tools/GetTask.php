<?php

namespace App\Mcp\Tools;

use App\Mcp\Support\Planner;
use App\Mcp\Support\Schemas;
use App\Mcp\Support\TaskOutput;
use App\Tasks\ItemKind;
use App\Tasks\TaskNotFound;
use Illuminate\Contracts\JsonSchema\JsonSchema;
use Laravel\Mcp\Request;
use Laravel\Mcp\Server\Attributes\Description;
use Laravel\Mcp\Server\Attributes\Name;
use Laravel\Mcp\Server\Tools\Annotations\IsIdempotent;
use Laravel\Mcp\Server\Tools\Annotations\IsOpenWorld;
use Laravel\Mcp\Server\Tools\Annotations\IsReadOnly;

#[Name('get_task')]
#[Description('One task by id, or one occurrence of a recurring task by its occurrence id (`<series id>:<YYYY-MM-DD>`; an occurrence that was changed resolves to its own row). For an occurrence or exception, `series` holds its series with the repeat rule (`recurrence`); for a plain task or a series it is null (a series carries its own `recurrence`). Deleted tasks are not found.')]
#[IsReadOnly]
#[IsIdempotent]
#[IsOpenWorld(false)]
class GetTask extends PlannerTool
{
    public function schema(JsonSchema $schema): array
    {
        return ['id' => Schemas::id($schema)];
    }

    protected function run(Request $request, Planner $planner): array
    {
        $id = $request->validate(['id' => ['required', 'string']])['id'];
        $item = $planner->tasks->findTask($id) ?? throw TaskNotFound::withId($id);
        $series = $item->kind === ItemKind::Task ? null : $planner->tasks->queries()->series((string) $item->seriesId());

        return [
            'task' => TaskOutput::item($item),
            'series' => $series === null || $item->kind === ItemKind::Series ? null : TaskOutput::row($series),
        ];
    }
}
