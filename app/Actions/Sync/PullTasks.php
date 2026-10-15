<?php

namespace App\Actions\Sync;

use App\Models\Task;
use App\Models\User;
use Illuminate\Database\Eloquent\Collection;

class PullTasks
{
    /**
     * Return the user's tasks changed after the cursor, oldest version first, tombstones included.
     *
     * Clients that do not understand daily rules get a daily series as a tombstone (v0.0.3 crashes on a live one), so
     * it also disappears there when a weekly or monthly series they hold becomes daily. Its exceptions still come, and
     * those clients show them as one-off tasks. The rows are only changed in the response, never stored.
     *
     * @return array{tasks: Collection<int, Task>, cursor: int, has_more: bool}
     */
    public function handle(User $user, int $cursor, int $limit, SyncFormat $format): array
    {
        $tasks = $user->tasks()
            ->where('version', '>', $cursor)
            ->orderBy('version')
            ->limit($limit + 1)
            ->get();

        $hasMore = $tasks->count() > $limit;
        $tasks = $tasks->take($limit);

        if (! $format->understandsDailyRules()) {
            $tasks->each(function (Task $task) {
                if (($task->recurrence['type'] ?? null) === 'daily') {
                    $task->deleted_at ??= $task->updated_at;
                }
            });
        }

        return [
            'tasks' => $tasks,
            'cursor' => $tasks->last()->version ?? $cursor,
            'has_more' => $hasMore,
        ];
    }
}
