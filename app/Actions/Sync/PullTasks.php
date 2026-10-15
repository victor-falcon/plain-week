<?php

namespace App\Actions\Sync;

use App\Http\Requests\Sync\SyncFormat;
use App\Models\Task;
use App\Models\User;
use Illuminate\Database\Eloquent\Collection;

class PullTasks
{
    /**
     * Return the user's tasks changed after the cursor, oldest version first, tombstones included.
     *
     * Clients that do not understand daily rules never get a daily series: v0.0.3 crashes on one. Their exceptions
     * still come, and those clients show them as one-off tasks.
     *
     * @return array{tasks: Collection<int, Task>, cursor: int, has_more: bool}
     */
    public function handle(User $user, int $cursor, int $limit, int $format): array
    {
        $tasks = $user->tasks()
            ->where('version', '>', $cursor)
            ->unless(SyncFormat::understandsDailyRules($format), fn ($query) => $query->where(
                fn ($query) => $query->whereNull('recurrence')->orWhere('recurrence->type', '!=', 'daily'),
            ))
            ->orderBy('version')
            ->limit($limit + 1)
            ->get();

        $hasMore = $tasks->count() > $limit;
        $tasks = $tasks->take($limit);

        return [
            'tasks' => $tasks,
            'cursor' => $tasks->last()->version ?? $cursor,
            'has_more' => $hasMore,
        ];
    }
}
