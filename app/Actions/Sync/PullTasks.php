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
     * @return array{tasks: Collection<int, Task>, cursor: int, has_more: bool}
     */
    public function handle(User $user, int $cursor, int $limit): array
    {
        $tasks = $user->tasks()
            ->where('version', '>', $cursor)
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
