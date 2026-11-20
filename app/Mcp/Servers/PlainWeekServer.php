<?php

namespace App\Mcp\Servers;

use App\Mcp\Methods\CallToolWithAccess;
use App\Mcp\Tools\CarryOver;
use App\Mcp\Tools\CreateTasks;
use App\Mcp\Tools\DeleteTask;
use App\Mcp\Tools\DuplicateTask;
use App\Mcp\Tools\ExportTasks;
use App\Mcp\Tools\GetProfile;
use App\Mcp\Tools\GetTask;
use App\Mcp\Tools\ImportTasks;
use App\Mcp\Tools\ListSomeday;
use App\Mcp\Tools\ListTasks;
use App\Mcp\Tools\MoveTask;
use App\Mcp\Tools\RestoreTask;
use App\Mcp\Tools\SearchTasks;
use App\Mcp\Tools\SetRecurrence;
use App\Mcp\Tools\SetSubtasks;
use App\Mcp\Tools\UpdateTask;
use App\Support\AppVersion;
use Laravel\Mcp\Server;
use Laravel\Mcp\Server\Attributes\Instructions;
use Laravel\Mcp\Server\Attributes\Name;

/**
 * Plain Week's MCP server at `/mcp` (routes/ai.php): the signed-in user's
 * planner, for AI agents. See docs/architecture.md#mcp-server.
 */
#[Name('Plain Week')]
#[Instructions(<<<'MARKDOWN'
    Plain Week is a minimal weekly planner: each day of the week holds an ordered list of tasks, and "Someday" holds tasks without a date in three columns (0, 1, 2). You act on behalf of the signed-in user, with the same access they have in the app; changes reach their devices on the next sync.

    - Call `get_profile` first: it gives the user's time zone and today's date there. Every date you read or write is a calendar date (`YYYY-MM-DD`) in that time zone, never UTC; "today", "tomorrow" and "this week" mean the user's. Weeks start on Monday.
    - Tasks have UUID ids. A task with a `null` date is in Someday.
    - A recurring task is a series. Each of its dates is an occurrence with the id `<series id>:<YYYY-MM-DD>` (the occurrence's original date). Use the occurrence id to change one date only, and the series id to change the whole series. An occurrence that was edited or moved gets its own task id.
    - Times are `HH:mm` (24 h) in the user's time zone; a task without a time is an all-day task.
    - Read with `list_tasks` (a range of days), `list_someday`, `get_task` and `search_tasks`. Each write tool returns the tasks it changed with their ids; prefer them over listing again.
    - A day's order matters: use `before_id` / `after_id` (ids of tasks in the target list) to place a task, otherwise it goes to the end.
    - `delete_task` returns a `restore_id`; `restore_task` brings the task back. Ask before deleting anything the user did not name.
    - The user sees what you changed in Settings › Agents & apps › Activity.
    - Tool errors are written for the user: when one says a paid plan is needed, tell the user and give them the link it contains.
    MARKDOWN)]
class PlainWeekServer extends Server
{
    /**
     * @var array<int, class-string<Server\Tool>>
     */
    protected array $tools = [
        GetProfile::class,
        ListTasks::class,
        ListSomeday::class,
        GetTask::class,
        SearchTasks::class,
        ExportTasks::class,
        CreateTasks::class,
        UpdateTask::class,
        SetSubtasks::class,
        MoveTask::class,
        DuplicateTask::class,
        SetRecurrence::class,
        DeleteTask::class,
        RestoreTask::class,
        CarryOver::class,
        ImportTasks::class,
    ];

    /**
     * Every tool in one `tools/list` page: some clients never ask for the next one.
     */
    public int $defaultPaginationLength = 50;

    /**
     * Tools only: no resources or prompts.
     *
     * @var array<string, array<string, bool>>
     */
    protected array $capabilities = [
        self::CAPABILITY_TOOLS => [
            'listChanged' => false,
        ],
    ];

    protected function boot(): void
    {
        $this->version = AppVersion::current();

        // In SaaS mode a tool call needs a paid plan, like sync (see CallToolWithAccess).
        $this->addMethod('tools/call', CallToolWithAccess::class);
    }
}
