<?php

namespace App\Actions\Sync;

use App\Models\Task;
use App\Models\TaskLabel;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;

class PushTasks
{
    /**
     * Upsert client records for the user with last-write-wins on `updated_at`.
     *
     * Records whose id belongs to another user are rejected, and so are records without the recurrence keys (clients
     * from before v0.0.2) for a stored series or exception, and records from clients that do not understand daily
     * rules (v0.0.3 and older) for a stored daily series: those clients cannot represent them. Records older than
     * the stored row are skipped silently (they are neither applied nor rejected). Every applied record gets a fresh, globally increasing version.
     *
     * Label records ({@see TaskLabel}) follow the same last-write-wins rule, keyed by the user and the color, and take
     * their versions from the same block. They are not reported in `applied` (which lists task ids).
     *
     * @param  list<array<string, mixed>>  $records  Validated wire records.
     * @param  list<array{color: string, name: string, updated_at: string}>  $labels  Validated label records.
     * @return array{applied: list<string>, rejected: list<string>, cursor: int}
     */
    public function handle(User $user, array $records, SyncFormat $format, array $labels): array
    {
        $applied = [];
        $rejected = [];

        if ($records !== [] || $labels !== []) {
            DB::transaction(function () use ($user, $records, $labels, $format, &$applied, &$rejected) {
                $nextVersion = SyncVersions::reserve(count($records) + count($labels));

                /** @var array<string, Task> $stored */
                $stored = Task::query()
                    ->whereIn('id', array_column($records, 'id'))
                    ->get()
                    ->keyBy('id')
                    ->all();

                foreach ($records as $record) {
                    $id = $record['id'];
                    $task = $stored[$id] ?? null;

                    if ($task !== null && ($task->user_id !== $user->id || $this->isLegacyWrite($record, $task, $format))) {
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

                $this->upsertLabels($user, $labels, $nextVersion);
            });
        }

        return [
            'applied' => array_values(array_unique($applied)),
            'rejected' => array_values(array_unique($rejected)),
            'cursor' => max((int) $user->tasks()->max('version'), (int) $user->taskLabels()->max('version')),
        ];
    }

    /**
     * Last-write-wins upsert of the user's label names; the name is stored trimmed.
     *
     * @param  list<array{color: string, name: string, updated_at: string}>  $labels
     */
    private function upsertLabels(User $user, array $labels, int $nextVersion): void
    {
        if ($labels === []) {
            return;
        }

        /** @var array<string, TaskLabel> $stored */
        $stored = $user->taskLabels()
            ->whereIn('color', array_column($labels, 'color'))
            ->get()
            ->keyBy(fn (TaskLabel $label) => $label->color->value)
            ->all();

        foreach ($labels as $record) {
            $label = $stored[$record['color']] ?? null;

            if ($label !== null && CarbonImmutable::parse($record['updated_at'], 'UTC')->lt($label->updated_at)) {
                continue;
            }

            $label ??= new TaskLabel;
            $label->fill([...$record, 'name' => trim($record['name'])]);
            $label->user_id = $user->id;
            $label->version = $nextVersion++;
            $label->save();
        }
    }

    /**
     * Whether an old client writes to a row it cannot represent.
     *
     * @param  array<string, mixed>  $record
     */
    private function isLegacyWrite(array $record, Task $task, SyncFormat $format): bool
    {
        if (! array_key_exists('recurrence', $record)) {
            return $task->recurrence !== null || $task->series_id !== null;
        }

        return ! $format->understandsDailyRules() && ($task->recurrence['type'] ?? null) === 'daily';
    }
}
