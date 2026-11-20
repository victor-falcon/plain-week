<?php

namespace App\Mcp\Tools;

use App\Mcp\Support\Describe;
use App\Mcp\Support\Planner;
use App\Mcp\Support\WriteResult;
use App\Tasks\ImportError;
use Illuminate\Contracts\JsonSchema\JsonSchema;
use Laravel\Mcp\Request;
use Laravel\Mcp\Server\Attributes\Description;
use Laravel\Mcp\Server\Attributes\Name;
use Laravel\Mcp\Server\Tools\Annotations\IsDestructive;
use Laravel\Mcp\Server\Tools\Annotations\IsOpenWorld;

#[Name('import_tasks')]
#[Description('Adds the tasks of a Plain Week export file (what `export_tasks` or Settings › Data export) to the planner, like the import in Settings › Data: every task is added with a new id at the end of its day (or Someday), and nothing that exists changes, so importing the same file twice adds its tasks twice. `file` is the export JSON, as an object or as a string. At most 2000 tasks per call.')]
#[IsDestructive(false)]
#[IsOpenWorld(false)]
class ImportTasks extends WriteTool
{
    /**
     * An import holds the sync write lock for its whole transaction, so it stays small.
     */
    public const int MAX_TASKS = 2000;

    public function schema(JsonSchema $schema): array
    {
        return [
            'file' => $schema->anyOf([
                $schema->object()->description('The export file: {"format":"plain-week","version":1,"tasks":[…]}.'),
                $schema->string()->description('The export file as JSON text.'),
            ])->description('A Plain Week export file.')->required(),
        ];
    }

    protected function run(Request $request, Planner $planner): WriteResult
    {
        $file = $request->get('file');

        if (is_string($file)) {
            $decoded = json_decode($file, true);
            $file = json_last_error() === JSON_ERROR_NONE && is_array($decoded) ? $decoded : $file;
        }

        if (! is_array($file) && ! is_string($file)) {
            throw new ImportError('`file` must be the export file, as an object or a JSON string.');
        }

        if (is_array($file) && is_array($file['tasks'] ?? null) && count($file['tasks']) > self::MAX_TASKS) {
            throw new ImportError('This file has '.count($file['tasks']).' tasks; import at most '.self::MAX_TASKS.' per call (split the file).');
        }

        $result = $planner->tasks->import($file);
        $ids = array_values(array_map(
            fn (array $task) => $task['id'],
            array_filter($result->tasks, fn (array $task) => $task['deleted_at'] === null && ($task['recurrence'] !== null || $task['series_id'] === null)),
        ));

        return new WriteResult(
            ['added' => $result->taskCount, 'recurring' => $result->recurringCount, 'task_ids' => $ids],
            $result->tasks === [] ? null : 'Imported '.Describe::count($result->taskCount, 'task').($result->recurringCount > 0 ? " ({$result->recurringCount} repeating)" : ''),
            $ids,
        );
    }
}
