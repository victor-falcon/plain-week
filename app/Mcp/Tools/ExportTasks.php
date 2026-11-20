<?php

namespace App\Mcp\Tools;

use App\Casts\UtcMillisDateTime;
use App\Mcp\Support\Planner;
use App\Models\Task;
use App\Support\AppVersion;
use App\Tasks\TaskImport;
use Carbon\CarbonImmutable;
use Illuminate\Contracts\JsonSchema\JsonSchema;
use Laravel\Mcp\Request;
use Laravel\Mcp\Server\Attributes\Description;
use Laravel\Mcp\Server\Attributes\Name;
use Laravel\Mcp\Server\Tools\Annotations\IsIdempotent;
use Laravel\Mcp\Server\Tools\Annotations\IsOpenWorld;
use Laravel\Mcp\Server\Tools\Annotations\IsReadOnly;

#[Name('export_tasks')]
#[Description('A full backup of the planner in Plain Week\'s export format (the same JSON file Settings › Data exports): `{"format":"plain-week","version":1,"exported_at":…,"app_version":…,"tasks":[…]}`, with every task as a sync row (recurring series, their changed occurrences and the deleted occurrences that keep them hidden). `import_tasks` takes this file back. It can be large; for reading the plan use `list_tasks` or `search_tasks`.')]
#[IsReadOnly]
#[IsIdempotent]
#[IsOpenWorld(false)]
class ExportTasks extends ReadTool
{
    public function schema(JsonSchema $schema): array
    {
        return [];
    }

    protected function run(Request $request, Planner $planner): array
    {
        $rows = Task::query()
            ->where('user_id', $planner->user->id)
            ->orderBy('id')
            ->get()
            ->map(fn (Task $task) => $task->toRecord())
            ->all();

        return [
            'format' => TaskImport::FORMAT,
            'version' => TaskImport::VERSION,
            'exported_at' => CarbonImmutable::now('UTC')->format(UtcMillisDateTime::WIRE_FORMAT),
            'app_version' => AppVersion::current(),
            'tasks' => TaskImport::backupRows(array_values($rows)),
        ];
    }
}
