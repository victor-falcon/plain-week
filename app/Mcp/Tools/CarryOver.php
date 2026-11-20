<?php

namespace App\Mcp\Tools;

use App\Mcp\Support\Describe;
use App\Mcp\Support\Planner;
use App\Mcp\Support\TaskOutput;
use App\Mcp\Support\WriteResult;
use App\Models\Task;
use App\Tasks\PlannerItem;
use App\Tasks\TaskRepository;
use Illuminate\Contracts\JsonSchema\JsonSchema;
use Laravel\Mcp\Request;
use Laravel\Mcp\Server\Attributes\Description;
use Laravel\Mcp\Server\Attributes\Name;
use Laravel\Mcp\Server\Tools\Annotations\IsDestructive;
use Laravel\Mcp\Server\Tools\Annotations\IsIdempotent;
use Laravel\Mcp\Server\Tools\Annotations\IsOpenWorld;

#[Name('carry_over')]
#[Description('"Move unfinished tasks to today", like the planner\'s button: every task not done and dated before today (user\'s time zone) moves to today, after the tasks already there, oldest day first. Recurring tasks and their occurrences never move. Returns today\'s date and the moved tasks.')]
#[IsDestructive(false)]
#[IsIdempotent]
#[IsOpenWorld(false)]
class CarryOver extends WriteTool
{
    public function schema(JsonSchema $schema): array
    {
        return [];
    }

    protected function run(Request $request, Planner $planner): WriteResult
    {
        $today = $planner->today();
        // The rows carryOverTasks moves (it only returns how many), read in the same transaction.
        $ids = Task::query()
            ->where('user_id', $planner->user->id)
            ->where('date', '<', $today)
            ->whereNull('deleted_at')
            ->where('done', false)
            ->get()
            ->filter(fn (Task $task) => TaskRepository::isCarriedOver($task->toRecord(), $today))
            ->pluck('id')
            ->all();

        $count = $planner->tasks->carryOverTasks($today);
        $moved = array_values(array_filter(
            $planner->tasks->listTasksIn($today),
            fn (PlannerItem $item) => in_array($item->id(), $ids, true),
        ));

        return new WriteResult(
            ['today' => $today, 'moved' => $count, 'tasks' => TaskOutput::items($moved)],
            $count === 0
                ? 'Found no unfinished tasks to move to today'
                : 'Moved '.Describe::count($count, 'unfinished task').' to today ('.$planner->dateLabel($today).')',
            array_values($ids),
        );
    }
}
