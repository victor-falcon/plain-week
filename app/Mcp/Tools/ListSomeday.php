<?php

namespace App\Mcp\Tools;

use App\Mcp\Support\Planner;
use App\Mcp\Support\TaskOutput;
use App\Tasks\PlannerItem;
use Carbon\CarbonImmutable;
use Illuminate\Contracts\JsonSchema\JsonSchema;
use Laravel\Mcp\Request;
use Laravel\Mcp\Server\Attributes\Description;
use Laravel\Mcp\Server\Attributes\Name;
use Laravel\Mcp\Server\Tools\Annotations\IsIdempotent;
use Laravel\Mcp\Server\Tools\Annotations\IsOpenWorld;
use Laravel\Mcp\Server\Tools\Annotations\IsReadOnly;

#[Name('list_someday')]
#[Description('The Someday list (tasks without a date), in its order. Like the planner, Someday tasks done before the current week began (Monday, user\'s time zone) are archived and left out unless `include_archived` is true; tasks done this week are listed.')]
#[IsReadOnly]
#[IsIdempotent]
#[IsOpenWorld(false)]
class ListSomeday extends PlannerTool
{
    public function schema(JsonSchema $schema): array
    {
        return [
            'include_archived' => $schema->boolean()->default(false)->description('Also list the archived (done before this week) Someday tasks.'),
        ];
    }

    protected function run(Request $request, Planner $planner): array
    {
        $includeArchived = (bool) ($request->validate(['include_archived' => ['sometimes', 'boolean']])['include_archived'] ?? false);
        // The client's isArchivedSomeday seen from the current week: done before its Monday, at local midnight.
        $weekStart = CarbonImmutable::parse($planner->weekStart(), $planner->timezone);
        $items = $planner->tasks->listTasksIn(null);
        $shown = array_values(array_filter($items, fn (PlannerItem $item) => $includeArchived || ! self::isArchived($item, $weekStart)));

        return [
            'tasks' => TaskOutput::items($shown),
            'archived_hidden' => count($items) - count($shown),
        ];
    }

    private static function isArchived(PlannerItem $item, CarbonImmutable $weekStart): bool
    {
        if (! $item->task['done']) {
            return false;
        }

        $doneAt = $item->task['done_at'];

        // Like the client, a done task without a readable done_at counts as archived.
        try {
            return $doneAt === null || CarbonImmutable::parse($doneAt)->lessThan($weekStart);
        } catch (\Throwable) {
            return true;
        }
    }
}
