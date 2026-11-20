<?php

namespace App\Mcp\Tools;

use App\Mcp\Support\Describe;
use App\Mcp\Support\Planner;
use App\Mcp\Support\Schemas;
use App\Mcp\Support\TaskOutput;
use App\Mcp\Support\WriteResult;
use App\Tasks\ItemKind;
use App\Tasks\Scope;
use App\Tasks\TaskNotFound;
use Illuminate\Contracts\JsonSchema\JsonSchema;
use Laravel\Mcp\Request;
use Laravel\Mcp\Server\Attributes\Description;
use Laravel\Mcp\Server\Attributes\Name;
use Laravel\Mcp\Server\Tools\Annotations\IsDestructive;
use Laravel\Mcp\Server\Tools\Annotations\IsOpenWorld;

#[Name('set_recurrence')]
#[Description('Makes a task repeat, changes its rule, or stops it repeating (`recurrence: null`). On a plain task a rule turns it into a series that starts on its date (a Someday task cannot repeat). On a series id it replaces the rule; null turns the series into a single plain task and drops its changed occurrences. On an occurrence, scope `future` (default) ends the series the day before and starts the new rule from that date (null: that date becomes a plain task and the later ones are gone); scope `this` takes only that date out of the series, as a plain task or the start of a new, separate series. Returns what now stands for the task (its occurrence on that date when the rule produces one) and its `series`.')]
#[IsDestructive(false)]
#[IsOpenWorld(false)]
class SetRecurrence extends WriteTool
{
    public function schema(JsonSchema $schema): array
    {
        return [
            'id' => Schemas::id($schema),
            'recurrence' => Schemas::recurrence($schema)->nullable()->required(),
            'scope' => Schemas::scope($schema, Scope::Future),
        ];
    }

    protected function run(Request $request, Planner $planner): WriteResult
    {
        $validated = $request->validate([
            'id' => ['required', 'string'],
            ...Schemas::recurrenceRules('recurrence', present: true),
            ...Schemas::scopeRules(),
        ], Schemas::recurrenceMessages('recurrence'));
        $before = $planner->tasks->findTask($validated['id']) ?? throw TaskNotFound::withId($validated['id']);
        $item = $planner->tasks->setRecurrence($validated['id'], $validated['recurrence'], Schemas::scopeFrom($validated, Scope::Future));
        $seriesId = $item->seriesId();
        $series = $seriesId === null ? null : $planner->tasks->queries()->series($seriesId);
        $text = TaskOutput::quote($item->task['text']);
        $summary = $series === null
            ? "Stopped {$text} repeating"
            : "Set {$text} to repeat ".Describe::recurrence($series['recurrence'] ?? ['type' => 'daily'], $planner);

        return new WriteResult(
            [
                'task' => TaskOutput::item($item),
                'series' => $series === null || $item->kind === ItemKind::Series ? null : TaskOutput::row($series),
            ],
            $summary,
            [$before->id(), $before->seriesId(), $item->id(), $seriesId],
        );
    }
}
