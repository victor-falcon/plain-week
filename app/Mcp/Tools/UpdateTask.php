<?php

namespace App\Mcp\Tools;

use App\Mcp\Support\Planner;
use App\Mcp\Support\Schemas;
use App\Mcp\Support\TaskOutput;
use App\Mcp\Support\WriteResult;
use App\Tasks\InvalidTaskChange;
use App\Tasks\Scope;
use App\Tasks\TaskNotFound;
use Illuminate\Contracts\JsonSchema\JsonSchema;
use Laravel\Mcp\Request;
use Laravel\Mcp\Server\Attributes\Description;
use Laravel\Mcp\Server\Attributes\Name;
use Laravel\Mcp\Server\Tools\Annotations\IsDestructive;
use Laravel\Mcp\Server\Tools\Annotations\IsOpenWorld;

#[Name('update_task')]
#[Description('Changes a task\'s `text`, `done`, `color`, `time` or `notes` (only the fields given). Use `move_task` to change its date or place, `set_subtasks` for its checklist and `set_recurrence` for its repeat rule. On an occurrence of a recurring task, scope `this` (default) changes only that date (it gets its own id: the result is `kind: "exception"`), and `future` changes that date and every later one (the series is split; earlier dates keep the old content). `done` is per occurrence, so it only takes scope `this`. Passing a series id changes the whole series.')]
#[IsDestructive(false)]
#[IsOpenWorld(false)]
class UpdateTask extends WriteTool
{
    private const array FIELDS = ['text', 'done', 'color', 'time', 'notes'];

    public function schema(JsonSchema $schema): array
    {
        return [
            'id' => Schemas::id($schema),
            'text' => $schema->string()->min(1),
            'done' => $schema->boolean(),
            'color' => Schemas::color($schema),
            'time' => Schemas::time($schema),
            'notes' => $schema->string(),
            'scope' => Schemas::scope($schema, Scope::This),
        ];
    }

    protected function run(Request $request, Planner $planner): WriteResult
    {
        $validated = $request->validate([
            'id' => ['required', 'string'],
            'text' => ['sometimes', 'required', 'string'],
            'done' => ['sometimes', 'boolean:strict'],
            'color' => ['sometimes', ...Schemas::colorRule()],
            'time' => ['sometimes', 'nullable', 'date_format:H:i'],
            'notes' => ['sometimes', 'string'],
            ...Schemas::scopeRules(),
        ]);
        $patch = array_intersect_key($validated, array_flip(self::FIELDS));

        if ($patch === []) {
            throw new InvalidTaskChange('Nothing to change: give at least one of '.implode(', ', self::FIELDS).'.');
        }

        $scope = Schemas::scopeFrom($validated, Scope::This);
        $before = $planner->tasks->findTask($validated['id']) ?? throw TaskNotFound::withId($validated['id']);

        if (array_key_exists('done', $patch) && $scope === Scope::Future && $before->belongsToSeries()) {
            throw new InvalidTaskChange('`done` applies to one occurrence at a time: use scope "this" to mark it, and update the other fields separately.');
        }

        $item = $planner->tasks->updateTask($validated['id'], $patch, $scope);
        $text = TaskOutput::quote($item->task['text']);
        $later = $scope === Scope::Future && $before->belongsToSeries() ? ' and its later occurrences' : '';
        $summary = match (array_keys($patch)) {
            ['done'] => $patch['done'] ? "Completed {$text}" : "Reopened {$text}",
            ['text'] => 'Renamed '.TaskOutput::quote($before->task['text'])." to {$text}{$later}",
            default => "Updated {$text}{$later} (".implode(', ', array_keys($patch)).')',
        };

        return new WriteResult(
            ['task' => TaskOutput::item($item)],
            $summary,
            [$before->id(), $item->id(), $item->seriesId()],
        );
    }
}
