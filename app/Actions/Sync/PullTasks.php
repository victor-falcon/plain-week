<?php

namespace App\Actions\Sync;

use App\Models\Task;
use App\Models\TaskLabel;
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
     * Clients that sync labels (format 3) also get the user's label names. Tasks and labels share one version
     * sequence, so a page holds the `$limit` rows of either kind with the lowest versions after the cursor. Older
     * clients get no labels and their cursor passes over them; they pull from 0 again once they understand them.
     *
     * @return array{tasks: Collection<int, Task>, labels: Collection<int, TaskLabel>, cursor: int, has_more: bool}
     */
    public function handle(User $user, int $cursor, int $limit, SyncFormat $format): array
    {
        $tasks = $user->tasks()
            ->where('version', '>', $cursor)
            ->orderBy('version')
            ->limit($limit + 1)
            ->get();

        $labels = $format->understandsLabels()
            ? $user->taskLabels()->where('version', '>', $cursor)->orderBy('version')->limit($limit + 1)->get()
            : new Collection;

        /** @var list<int> $versions */
        $versions = $tasks->pluck('version')->merge($labels->pluck('version'))->sort()->values()->all();
        $hasMore = count($versions) > $limit;
        $last = $versions[min($limit, count($versions)) - 1] ?? $cursor;

        $tasks = $tasks->filter(fn (Task $task) => $task->version <= $last)->values();
        $labels = $labels->filter(fn (TaskLabel $label) => $label->version <= $last)->values();

        if (! $format->understandsDailyRules()) {
            $tasks->each(function (Task $task) {
                if (($task->recurrence['type'] ?? null) === 'daily') {
                    $task->deleted_at ??= $task->updated_at;
                }
            });
        }

        return [
            'tasks' => $tasks,
            'labels' => $labels,
            'cursor' => $last,
            'has_more' => $hasMore,
        ];
    }
}
