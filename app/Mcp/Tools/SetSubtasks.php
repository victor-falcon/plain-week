<?php

namespace App\Mcp\Tools;

use App\Mcp\Support\Describe;
use App\Mcp\Support\Planner;
use App\Mcp\Support\Schemas;
use App\Mcp\Support\TaskOutput;
use App\Mcp\Support\WriteResult;
use App\Tasks\InvalidTaskChange;
use App\Tasks\PlannerItem;
use App\Tasks\Scope;
use Illuminate\Contracts\JsonSchema\JsonSchema;
use Illuminate\Support\Str;
use Laravel\Mcp\Request;
use Laravel\Mcp\Server\Attributes\Description;
use Laravel\Mcp\Server\Attributes\Name;
use Laravel\Mcp\Server\Tools\Annotations\IsDestructive;
use Laravel\Mcp\Server\Tools\Annotations\IsOpenWorld;

/**
 * @phpstan-import-type Subtask from PlannerItem
 */
#[Name('set_subtasks')]
#[Description('Changes a task\'s checklist with a list of operations, applied in order and all or none: `{"op":"add","text":"…","done":false}` (appended), `{"op":"edit","id":"…","text":"…"}`, `{"op":"toggle","id":"…","done":true}` (`done` omitted: flips it), `{"op":"remove","id":"…"}`, `{"op":"reorder","ids":[…]}` (every subtask id, in the new order). Subtask ids are in the task\'s `subtasks`. Scope works like `update_task` for occurrences of a recurring task. Returns the task with its new subtasks.')]
#[IsDestructive(false)]
#[IsOpenWorld(false)]
class SetSubtasks extends PlannerTool
{
    public const int MAX_SUBTASKS = 100;

    public function schema(JsonSchema $schema): array
    {
        return [
            'id' => Schemas::id($schema),
            'operations' => $schema->array()->min(1)->max(self::MAX_SUBTASKS)->items($schema->object([
                'op' => $schema->string()->enum(['add', 'edit', 'toggle', 'remove', 'reorder'])->required(),
                'id' => $schema->string()->description('The subtask (edit, toggle, remove).'),
                'text' => $schema->string()->description('add, edit.'),
                'done' => $schema->boolean()->description('add, toggle.'),
                'ids' => $schema->array()->items($schema->string())->description('reorder: every subtask id in the new order.'),
            ])->withoutAdditionalProperties())->required(),
            'scope' => Schemas::scope($schema, Scope::This),
        ];
    }

    protected function run(Request $request, Planner $planner): WriteResult
    {
        $validated = $request->validate([
            'id' => ['required', 'string'],
            'operations' => ['required', 'list', 'min:1', 'max:'.self::MAX_SUBTASKS],
            'operations.*' => ['array:op,id,text,done,ids'],
            'operations.*.op' => ['required', 'in:add,edit,toggle,remove,reorder'],
            'operations.*.id' => ['required_if:operations.*.op,edit,toggle,remove', 'string'],
            'operations.*.text' => ['required_if:operations.*.op,add,edit', 'string'],
            'operations.*.done' => ['sometimes', 'boolean:strict'],
            'operations.*.ids' => ['required_if:operations.*.op,reorder', 'list'],
            'operations.*.ids.*' => ['string'],
            ...Schemas::scopeRules(),
        ]);
        $counts = [];
        $item = $planner->tasks->updateSubtasks(
            $validated['id'],
            function (array $subtasks) use ($validated, &$counts) {
                $counts = [];

                foreach ($validated['operations'] as $index => $operation) {
                    $subtasks = self::apply($subtasks, $operation, $index + 1);
                    $verb = match ($operation['op']) {
                        'add' => 'added',
                        'edit' => 'edited',
                        'toggle' => 'checked',
                        'remove' => 'removed',
                        default => 'reordered',
                    };
                    $counts[$verb] = ($counts[$verb] ?? 0) + 1;
                }

                if (count($subtasks) > self::MAX_SUBTASKS) {
                    throw new InvalidTaskChange('A task can have at most '.self::MAX_SUBTASKS.' subtasks.');
                }

                return $subtasks;
            },
            Scope::from($validated['scope'] ?? Scope::This->value),
        );

        $changes = implode(', ', array_map(
            fn (string $verb, int $count) => $verb === 'reordered' ? 'reordered' : "{$verb} ".Describe::count($count, 'subtask'),
            array_keys($counts),
            $counts,
        ));

        return new WriteResult(
            ['task' => TaskOutput::item($item)],
            'Changed the subtasks of '.TaskOutput::quote($item->task['text']).": {$changes}",
            array_values(array_unique(array_filter([$validated['id'], $item->id(), $item->seriesId()]))),
        );
    }

    /**
     * @param  list<Subtask>  $subtasks
     * @param  array<string, mixed>  $operation
     * @return list<Subtask>
     */
    private static function apply(array $subtasks, array $operation, int $number): array
    {
        $ids = array_column($subtasks, 'id');
        $find = function (string $id) use ($ids, $number): int {
            $index = array_search($id, $ids, true);

            return $index === false
                ? throw new InvalidTaskChange("Operation {$number}: subtask {$id} does not exist on this task.")
                : (int) $index;
        };

        switch ($operation['op']) {
            case 'add':
                $subtasks[] = ['id' => (string) Str::uuid7(), 'text' => (string) $operation['text'], 'done' => (bool) ($operation['done'] ?? false)];
                break;
            case 'edit':
                $index = $find($operation['id']);
                $subtasks[$index] = [...$subtasks[$index], 'text' => (string) $operation['text']];
                break;
            case 'toggle':
                $index = $find($operation['id']);
                $subtasks[$index] = [...$subtasks[$index], 'done' => (bool) ($operation['done'] ?? ! $subtasks[$index]['done'])];
                break;
            case 'remove':
                array_splice($subtasks, $find($operation['id']), 1);
                break;
            default:
                /** @var list<string> $order */
                $order = $operation['ids'];
                $sorted = $order;
                $current = $ids;
                sort($sorted);
                sort($current);

                if ($sorted !== $current) {
                    throw new InvalidTaskChange("Operation {$number}: reorder needs every subtask id exactly once (".implode(', ', $ids).').');
                }

                $byId = array_combine($ids, $subtasks);
                $subtasks = array_map(fn (string $id) => $byId[$id], $order);
        }

        return $subtasks;
    }
}
