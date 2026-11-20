<?php

namespace App\Mcp\Tools;

use App\Mcp\Support\Planner;
use App\Mcp\Support\Schemas;
use App\Mcp\Support\TaskOutput;
use App\Models\Task;
use App\Tasks\ItemKind;
use App\Tasks\PlannerItem;
use App\Tasks\TaskOccurrences;
use App\Tasks\TaskOrder;
use Illuminate\Contracts\JsonSchema\JsonSchema;
use Illuminate\Support\Collection;
use Laravel\Mcp\Request;
use Laravel\Mcp\Server\Attributes\Description;
use Laravel\Mcp\Server\Attributes\Name;
use Laravel\Mcp\Server\Tools\Annotations\IsIdempotent;
use Laravel\Mcp\Server\Tools\Annotations\IsOpenWorld;
use Laravel\Mcp\Server\Tools\Annotations\IsReadOnly;

#[Name('search_tasks')]
#[Description('Finds tasks whose text, notes or subtasks contain `query` (case-insensitive), across all dates and Someday. A recurring task is found once, as its series (`kind: "series"`, with its rule); occurrences that were changed are found as exceptions. Optional filters: `from`/`to` (dated tasks in that range; a series counts when it repeats within it), `done`, `color`, `recurring`. Results are ordered by date (Someday last); pass `next_cursor` back as `cursor` for the next page.')]
#[IsReadOnly]
#[IsIdempotent]
#[IsOpenWorld(false)]
class SearchTasks extends ReadTool
{
    public const int DEFAULT_LIMIT = 20;

    public const int MAX_LIMIT = 100;

    public function schema(JsonSchema $schema): array
    {
        return [
            'query' => $schema->string()->min(1)->description('Text to look for.')->required(),
            'from' => Schemas::date($schema, 'Only tasks dated on or after this day (`YYYY-MM-DD`); leaves out Someday.'),
            'to' => Schemas::date($schema, 'Only tasks dated on or before this day (`YYYY-MM-DD`); leaves out Someday.'),
            'done' => $schema->boolean()->description('Only done (true) or not done (false) tasks. A series is never done.'),
            'color' => Schemas::color($schema),
            'recurring' => $schema->boolean()->description('Only tasks that belong to a recurring task (true: series and changed occurrences) or only plain tasks (false).'),
            'limit' => $schema->integer()->min(1)->max(self::MAX_LIMIT)->default(self::DEFAULT_LIMIT)->description('Results per page (1–'.self::MAX_LIMIT.').'),
            'cursor' => $schema->string()->description('`next_cursor` of the previous page.'),
        ];
    }

    protected function run(Request $request, Planner $planner): array
    {
        $validated = $request->validate([
            'query' => ['required', 'string'],
            'from' => ['sometimes', 'date_format:Y-m-d'],
            'to' => ['sometimes', 'date_format:Y-m-d'],
            'done' => ['sometimes', 'boolean'],
            'color' => ['sometimes', ...Schemas::colorRule()],
            'recurring' => ['sometimes', 'boolean'],
            'limit' => ['sometimes', 'integer', 'between:1,'.self::MAX_LIMIT],
            'cursor' => ['sometimes', 'string', 'regex:/^\d+$/'],
        ], ['cursor.regex' => 'The cursor is not one this tool returned.']);

        $query = mb_strtolower(trim($validated['query']));
        $from = $validated['from'] ?? null;
        $to = $validated['to'] ?? null;
        $limit = (int) ($validated['limit'] ?? self::DEFAULT_LIMIT);
        $offset = (int) ($validated['cursor'] ?? 0);

        $matches = self::liveItems($planner)
            ->filter(fn (PlannerItem $item) => self::contains($item, $query))
            ->filter(fn (PlannerItem $item) => self::inRange($item, $from, $to))
            ->filter(fn (PlannerItem $item) => ! isset($validated['done']) || $item->task['done'] === (bool) $validated['done'])
            ->filter(fn (PlannerItem $item) => ! isset($validated['color']) || $item->task['color'] === $validated['color'])
            ->filter(fn (PlannerItem $item) => ! isset($validated['recurring']) || $item->isRecurring() === (bool) $validated['recurring'])
            ->sort(self::compare(...))
            ->values();

        $page = $matches->slice($offset, $limit)->values();
        $next = $offset + $limit;

        return [
            'tasks' => TaskOutput::items($page),
            'total' => $matches->count(),
            'next_cursor' => $next < $matches->count() ? (string) $next : null,
        ];
    }

    /**
     * Every live row of the user as an item, without the exception rows that lost to a duplicate.
     *
     * @return Collection<int, PlannerItem>
     */
    private static function liveItems(Planner $planner): Collection
    {
        $rows = Task::query()->where('user_id', $planner->user->id)->whereNull('deleted_at')->get();
        $exceptions = Task::query()
            ->where('user_id', $planner->user->id)
            ->whereIn('series_id', $rows->whereNotNull('series_id')->pluck('series_id')->unique()->values())
            ->get()
            ->groupBy(fn (Task $task) => "{$task->series_id}|{$task->occurrence_date}")
            ->map(fn (Collection $duplicates) => TaskOccurrences::winningException($duplicates)?->id);

        return $rows
            ->map(fn (Task $task) => PlannerItem::fromRow($task->toRecord()))
            ->reject(fn (PlannerItem $item) => $item->kind === ItemKind::Exception
                && $exceptions->get("{$item->task['series_id']}|{$item->task['occurrence_date']}") !== $item->id())
            ->values();
    }

    private static function contains(PlannerItem $item, string $query): bool
    {
        $haystacks = [$item->task['text'], $item->task['notes'], ...array_column($item->task['subtasks'], 'text')];

        foreach ($haystacks as $haystack) {
            if (str_contains(mb_strtolower((string) $haystack), $query)) {
                return true;
            }
        }

        return false;
    }

    private static function inRange(PlannerItem $item, ?string $from, ?string $to): bool
    {
        if ($from === null && $to === null) {
            return true;
        }

        $date = $item->task['date'];

        if ($date === null) {
            return false;
        }

        if ($item->kind === ItemKind::Series) {
            $until = $item->task['recurrence']['until'] ?? null;

            return ($to === null || $date <= $to) && ($from === null || $until === null || $until >= $from);
        }

        return ($from === null || $date >= $from) && ($to === null || $date <= $to);
    }

    private static function compare(PlannerItem $a, PlannerItem $b): int
    {
        $dateA = $a->task['date'];
        $dateB = $b->task['date'];

        if ($dateA !== $dateB) {
            return $dateA === null ? 1 : ($dateB === null ? -1 : $dateA <=> $dateB);
        }

        return $dateA === null
            ? TaskOrder::compareSomedayOrder($a->task, $b->task)
            : TaskOrder::compareTaskOrder($a->task, $b->task);
    }
}
