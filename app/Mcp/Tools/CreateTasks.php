<?php

namespace App\Mcp\Tools;

use App\Mcp\Support\Describe;
use App\Mcp\Support\Neighbours;
use App\Mcp\Support\Planner;
use App\Mcp\Support\Schemas;
use App\Mcp\Support\TaskOutput;
use App\Mcp\Support\WriteResult;
use App\Tasks\InvalidTaskChange;
use App\Tasks\PlannerItem;
use App\Tasks\TaskDomainException;
use Illuminate\Contracts\JsonSchema\JsonSchema;
use Illuminate\Support\Str;
use Laravel\Mcp\Request;
use Laravel\Mcp\Server\Attributes\Description;
use Laravel\Mcp\Server\Attributes\Name;
use Laravel\Mcp\Server\Tools\Annotations\IsDestructive;
use Laravel\Mcp\Server\Tools\Annotations\IsOpenWorld;

#[Name('create_tasks')]
#[Description('Creates up to 100 tasks at once, all or none. Each task goes to `date` (`YYYY-MM-DD`; omitted: today in the user\'s time zone; null: Someday), at the end of that list unless `before_id` / `after_id` name a task already there. Tasks of the same batch with the same `after_id` keep the batch order. With `recurrence` the task becomes a recurring series starting on its date (Someday tasks cannot repeat); it is then returned as its first occurrence (`kind: "occurrence"`, id `<series id>:<YYYY-MM-DD>`) with its `series_id`.')]
#[IsDestructive(false)]
#[IsOpenWorld(false)]
class CreateTasks extends PlannerTool
{
    public const int MAX_TASKS = 100;

    public function schema(JsonSchema $schema): array
    {
        return [
            'tasks' => $schema->array()->min(1)->max(self::MAX_TASKS)->items($schema->object([
                'text' => $schema->string()->min(1)->description('What to do.')->required(),
                'date' => Schemas::date($schema, '`YYYY-MM-DD`; omit for today, null for Someday.')->nullable(),
                'after_id' => $schema->string()->nullable()->description('Place it right after this task of the same day (or Someday).'),
                'before_id' => $schema->string()->nullable()->description('Place it right before this task of the same day (or Someday).'),
                'color' => Schemas::color($schema),
                'time' => Schemas::time($schema),
                'notes' => $schema->string()->description('Free-form notes.'),
                'subtasks' => $schema->array()->max(100)->items($schema->object([
                    'text' => $schema->string()->required(),
                    'done' => $schema->boolean(),
                ])->withoutAdditionalProperties())->description('Checklist items, in order.'),
                'recurrence' => Schemas::recurrence($schema)->nullable(),
            ])->withoutAdditionalProperties())->required(),
        ];
    }

    protected function run(Request $request, Planner $planner): WriteResult
    {
        $validated = $request->validate([
            'tasks' => ['required', 'list', 'min:1', 'max:'.self::MAX_TASKS],
            'tasks.*' => ['required', 'array:text,date,after_id,before_id,color,time,notes,subtasks,recurrence'],
            'tasks.*.text' => ['required', 'string'],
            'tasks.*.date' => ['sometimes', 'nullable', 'date_format:Y-m-d'],
            'tasks.*.after_id' => ['sometimes', 'nullable', 'string'],
            'tasks.*.before_id' => ['sometimes', 'nullable', 'string'],
            'tasks.*.color' => ['sometimes', ...Schemas::colorRule()],
            'tasks.*.time' => ['sometimes', 'nullable', 'date_format:H:i'],
            'tasks.*.notes' => ['sometimes', 'string'],
            'tasks.*.subtasks' => ['sometimes', 'list', 'max:100'],
            'tasks.*.subtasks.*' => ['array:text,done'],
            'tasks.*.subtasks.*.text' => ['required', 'string'],
            'tasks.*.subtasks.*.done' => ['sometimes', 'boolean:strict'],
            ...Schemas::recurrenceRules('tasks.*.recurrence'),
        ]);

        $created = [];
        $previous = null;

        foreach ($validated['tasks'] as $index => $input) {
            $date = array_key_exists('date', $input) ? $input['date'] : $planner->today();
            $afterId = $input['after_id'] ?? null;
            $beforeId = $input['before_id'] ?? null;

            try {
                Neighbours::check($planner, $date, $beforeId, $afterId);

                // The repository puts each new task right after `after_id`, so several given the same one would end up
                // in reverse order: chain them after the previous task of the batch instead.
                if ($previous !== null && $afterId !== null && $previous['date'] === $date
                    && $previous['after_id'] === $afterId && $previous['before_id'] === $beforeId) {
                    $afterId = $previous['item']->id();
                }

                $row = $planner->tasks->createTask([
                    'text' => $input['text'],
                    'date' => $date,
                    'after_id' => $afterId,
                    'before_id' => $beforeId,
                    'color' => $input['color'] ?? 'none',
                    'time' => $input['time'] ?? null,
                    'notes' => $input['notes'] ?? '',
                    'subtasks' => array_map(fn (array $subtask) => [
                        'id' => (string) Str::uuid7(),
                        'text' => $subtask['text'],
                        'done' => $subtask['done'] ?? false,
                    ], array_values($input['subtasks'] ?? [])),
                ]);

                $item = ($input['recurrence'] ?? null) !== null
                    ? $planner->tasks->setRecurrence($row['id'], $input['recurrence'])
                    : PlannerItem::fromRow($row);
            } catch (TaskDomainException $e) {
                throw new InvalidTaskChange('Task '.($index + 1).': '.$e->getMessage(), previous: $e);
            }

            $created[] = $item;
            $previous = ['date' => $date, 'after_id' => $input['after_id'] ?? null, 'before_id' => $beforeId, 'item' => $item];
        }

        return new WriteResult(
            ['created' => TaskOutput::items($created)],
            self::summary($created, $planner),
            array_map(fn (PlannerItem $item) => $item->seriesId() ?? $item->id(), $created),
        );
    }

    /**
     * "Created “Buy milk” on Mon 23 Nov", "Created 3 tasks on Mon 23 Nov", "Created 3 tasks".
     *
     * @param  list<PlannerItem>  $created
     */
    private static function summary(array $created, Planner $planner): string
    {
        $dates = array_unique(array_map(fn (PlannerItem $item) => $item->task['date'] ?? '', $created));
        $place = count($dates) === 1 ? ' '.$planner->placeLabel($created[0]->task['date']) : '';
        $what = count($created) === 1 ? TaskOutput::quote($created[0]->task['text']) : Describe::count(count($created), 'task');

        return "Created {$what}{$place}";
    }
}
