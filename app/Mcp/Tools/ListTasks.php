<?php

namespace App\Mcp\Tools;

use App\Mcp\Support\Planner;
use App\Mcp\Support\Schemas;
use App\Mcp\Support\TaskOutput;
use App\Tasks\InvalidTaskChange;
use App\Tasks\PlannerItem;
use App\Tasks\TaskOrder;
use Carbon\CarbonImmutable;
use Illuminate\Contracts\JsonSchema\JsonSchema;
use Laravel\Mcp\Request;
use Laravel\Mcp\Server\Attributes\Description;
use Laravel\Mcp\Server\Attributes\Name;
use Laravel\Mcp\Server\Tools\Annotations\IsIdempotent;
use Laravel\Mcp\Server\Tools\Annotations\IsOpenWorld;
use Laravel\Mcp\Server\Tools\Annotations\IsReadOnly;

#[Name('list_tasks')]
#[Description('The planner from `from` to `to` (inclusive calendar dates in the user\'s time zone, at most 92 days): every day with its tasks in the order the planner shows them (timed tasks first by time, then the rest in their manual order). Done tasks are included (`done: true`), and so are the occurrences of recurring tasks: a generated occurrence has `kind: "occurrence"` and the id `<series id>:<YYYY-MM-DD>`; one that was changed has `kind: "exception"` and its own id. Someday tasks are not listed here: use `list_someday`.')]
#[IsReadOnly]
#[IsIdempotent]
#[IsOpenWorld(false)]
class ListTasks extends PlannerTool
{
    public const int MAX_DAYS = 92;

    public function schema(JsonSchema $schema): array
    {
        return [
            'from' => Schemas::date($schema, 'First day, `YYYY-MM-DD`.')->required(),
            'to' => Schemas::date($schema, 'Last day, `YYYY-MM-DD` (at most 92 days after `from`, counting both).')->required(),
        ];
    }

    protected function run(Request $request, Planner $planner): array
    {
        $validated = $request->validate([
            'from' => ['required', 'date_format:Y-m-d'],
            'to' => ['required', 'date_format:Y-m-d', 'after_or_equal:from'],
        ]);
        $from = CarbonImmutable::createFromFormat('!Y-m-d', $validated['from'], 'UTC') ?: CarbonImmutable::now('UTC');
        $to = CarbonImmutable::createFromFormat('!Y-m-d', $validated['to'], 'UTC') ?: $from;

        if ((int) $from->diffInDays($to) + 1 > self::MAX_DAYS) {
            throw new InvalidTaskChange('The range is too long: ask for at most '.self::MAX_DAYS.' days at a time.');
        }

        $byDate = [];

        foreach ($planner->tasks->queries()->rangeItems($validated['from'], $validated['to']) as $item) {
            $byDate[(string) $item->task['date']][] = $item;
        }

        $days = [];

        for ($day = $from; $day <= $to; $day = $day->addDay()) {
            $date = $day->toDateString();
            $items = $byDate[$date] ?? [];
            usort($items, self::compareDayOrder(...));
            $days[] = ['date' => $date, 'weekday' => $day->format('l'), 'tasks' => TaskOutput::items($items)];
        }

        return ['from' => $validated['from'], 'to' => $validated['to'], 'today' => $planner->today(), 'days' => $days];
    }

    /**
     * The planner's display order inside a day (the client's `compareDayOrder`): timed tasks first, earliest first,
     * then the rest by position.
     */
    private static function compareDayOrder(PlannerItem $a, PlannerItem $b): int
    {
        $timeA = $a->task['time'];
        $timeB = $b->task['time'];

        if ($timeA !== null && $timeB !== null && $timeA !== $timeB) {
            return $timeA <=> $timeB;
        }

        if (($timeA === null) !== ($timeB === null)) {
            return $timeA === null ? 1 : -1;
        }

        return TaskOrder::compareTaskOrder($a->task, $b->task);
    }
}
