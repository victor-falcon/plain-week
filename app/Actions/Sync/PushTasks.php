<?php

namespace App\Actions\Sync;

use App\Models\Task;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;

class PushTasks
{
    /**
     * Upsert client records for the user with last-write-wins on `updated_at`.
     *
     * Records whose id belongs to another user are rejected. Records older than the stored row are skipped silently
     * (they are neither applied nor rejected). Every applied record gets a fresh, globally increasing version.
     *
     * @param  list<array<string, mixed>>  $records  Validated wire records.
     * @return array{applied: list<string>, rejected: list<string>, cursor: int}
     */
    public function handle(User $user, array $records): array
    {
        $applied = [];
        $rejected = [];

        if ($records !== []) {
            DB::transaction(function () use ($user, $records, &$applied, &$rejected) {
                $nextVersion = $this->reserveVersions(count($records));

                /** @var array<string, Task> $stored */
                $stored = Task::query()
                    ->whereIn('id', array_column($records, 'id'))
                    ->get()
                    ->keyBy('id')
                    ->all();

                foreach ($records as $record) {
                    $id = $record['id'];
                    $task = $stored[$id] ?? null;

                    if ($task !== null && $task->user_id !== $user->id) {
                        $rejected[] = $id;

                        continue;
                    }

                    if ($task !== null && CarbonImmutable::parse($record['updated_at'], 'UTC')->lt($task->updated_at)) {
                        continue;
                    }

                    $task ??= new Task;
                    $task->fill($record);
                    $task->user_id = $user->id;
                    $task->version = $nextVersion++;
                    $task->save();

                    $stored[$id] = $task;
                    $applied[] = $id;
                }
            });
        }

        return [
            'applied' => array_values(array_unique($applied)),
            'rejected' => array_values(array_unique($rejected)),
            'cursor' => (int) $user->tasks()->max('version'),
        ];
    }

    /**
     * Reserve a block of versions and return the first one.
     *
     * The counter update is the first statement of the transaction, so it takes the write lock up front: the row lock
     * on MySQL/PostgreSQL and the database write lock on SQLite. Concurrent pushes therefore commit their versions in
     * order. Unused versions in the block leave gaps, which is fine: versions are only required to increase.
     */
    private function reserveVersions(int $count): int
    {
        DB::table('sync_versions')->where('id', 1)->increment('value', $count);

        $last = (int) DB::table('sync_versions')->where('id', 1)->value('value');

        return $last - $count + 1;
    }
}
