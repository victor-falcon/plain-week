<?php

namespace App\Tasks;

use App\Actions\Sync\SyncVersions;
use App\Casts\UtcMillisDateTime;
use App\Enums\TaskColor;
use App\Jobs\SyncGoogleCalendar;
use App\Models\Task;
use App\Models\User;
use Carbon\CarbonImmutable;
use Closure;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use LogicException;

/**
 * The planner's task mutations on the server, for one user: a port of the client repository
 * (`resources/js/lib/db/tasks.ts`) with the same semantics, so an agent changing tasks through the server does exactly
 * what the planner would. Browsers pick the changes up on their next pull. See "Repository API" and "Recurring tasks
 * (client)" in docs/architecture.md.
 *
 * Every method that takes an id also accepts an occurrence id (`${seriesId}:${YYYY-MM-DD}`); a missing or deleted task
 * throws {@see TaskNotFound}, a change the planner refuses {@see InvalidTaskChange}. Each mutation reads and writes in
 * one transaction that holds the sync write lock from its first statement, gives every row it writes a newer
 * `updated_at` (UTC ms, strictly after the stored one) and a fresh `version`, and validates the rows with the push
 * rules. Dates ("today", where a task goes) come from the caller, in the user's time zone; the clock is only read
 * for timestamps.
 *
 * @phpstan-import-type TaskRecord from PlannerItem
 * @phpstan-import-type Subtask from PlannerItem
 * @phpstan-import-type Recurrence from TaskOccurrences
 *
 * @phpstan-type Slot array{date: string|null, someday_column: int|null, position: string}
 * @phpstan-type NewTask array{text: string, date?: string|null, after_id?: string|null, before_id?: string|null, color?: TaskColor|string, time?: string|null, notes?: string, subtasks?: list<Subtask>}
 * @phpstan-type TaskPatch array{text?: string, done?: bool, color?: TaskColor|string, time?: string|null, notes?: string, subtasks?: list<Subtask>}
 */
final class TaskRepository
{
    /**
     * The fields `updateTask` changes. Use `moveTask` to move and `setRecurrence` for the rule.
     */
    public const array PATCHABLE_FIELDS = ['text', 'done', 'color', 'time', 'notes', 'subtasks'];

    private readonly TaskQueries $queries;

    /**
     * The last timestamp handed out (ms), so timestamps never repeat within this repository.
     */
    private int $lastTimestamp = 0;

    public function __construct(private readonly User $user)
    {
        $this->queries = new TaskQueries($user);
    }

    public static function for(User $user): self
    {
        return new self($user);
    }

    public function queries(): TaskQueries
    {
        return $this->queries;
    }

    /**
     * A live item by id (occurrence ids included), or null.
     */
    public function findTask(string $id): ?PlannerItem
    {
        return $this->queries->find($id);
    }

    /**
     * Live items of a day in position order (occurrences included), or of the Someday list (`$date` null, archived
     * tasks included). For picking neighbours.
     *
     * @return list<PlannerItem>
     */
    public function listTasksIn(?string $date): array
    {
        return $this->queries->listIn($this->checkedDate($date));
    }

    /**
     * Creates a task (`date` null: Someday), placed like {@see moveTask}: between the given neighbours, or at the end.
     *
     * @param  NewTask  $input
     * @return TaskRecord
     */
    public function createTask(array $input): array
    {
        return $this->createTasks([$input])[0];
    }

    /**
     * Creates several tasks in one transaction, each placed as if created one after the other (so a batch for one
     * day keeps its order at the end of it).
     *
     * @param  list<NewTask>  $inputs
     * @return list<TaskRecord>
     */
    public function createTasks(array $inputs): array
    {
        return $this->write(function () use ($inputs) {
            $rows = [];

            foreach ($inputs as $input) {
                $slot = $this->slotIn($input['date'] ?? null, $input['after_id'] ?? null, $input['before_id'] ?? null, pending: $rows);
                $now = $this->nextTimestamp();
                $color = $input['color'] ?? TaskColor::None;

                $rows[] = [
                    'id' => self::newId(),
                    'text' => $input['text'],
                    ...$slot,
                    'done' => false,
                    'done_at' => null,
                    'color' => $color instanceof TaskColor ? $color->value : $color,
                    'time' => $input['time'] ?? null,
                    'notes' => $input['notes'] ?? '',
                    'subtasks' => $input['subtasks'] ?? [],
                    'recurrence' => null,
                    'series_id' => null,
                    'occurrence_date' => null,
                    'created_at' => $now,
                    'updated_at' => $now,
                    'deleted_at' => null,
                ];
            }

            return [$rows, $rows];
        });
    }

    /**
     * Changes `text`, `done`, `color`, `time`, `notes` or `subtasks`; other keys are ignored. Changing `done` sets or
     * clears `done_at`. On an occurrence, scope `this` writes an exception and `future` splits the series at its date
     * (`done` never reaches a series). Returns the item that now shows the change: the exception for `this`, the new
     * series' occurrence for `future`.
     *
     * @param  TaskPatch  $patch
     */
    public function updateTask(string $id, array $patch, Scope $scope = Scope::This): PlannerItem
    {
        return $this->edit($id, fn () => $patch, $scope);
    }

    /**
     * Toggles done; on an occurrence it only ever affects that one.
     */
    public function toggleDone(string $id): PlannerItem
    {
        return $this->edit($id, fn (PlannerItem $item) => ['done' => ! $item->task['done']], Scope::This);
    }

    /**
     * Replaces the subtasks with `$update(current)`, reading and writing in one transaction.
     *
     * @param  Closure(list<Subtask>): list<Subtask>  $update
     */
    public function updateSubtasks(string $id, Closure $update, Scope $scope = Scope::This): PlannerItem
    {
        return $this->edit($id, fn (PlannerItem $item) => ['subtasks' => $update($item->task['subtasks'])], $scope);
    }

    /**
     * Soft-deletes (a tombstone that syncs). On an occurrence, scope `this` writes a deleted exception and `future`
     * ends the series the day before (deleting it with its exceptions when it starts that day). A series row is
     * deleted with all its exceptions. Returns the tombstone, or the ended series for `future`.
     *
     * @return TaskRecord
     */
    public function deleteTask(string $id, Scope $scope = Scope::This): array
    {
        return $this->write(function () use ($id, $scope) {
            $item = $this->getLive($id);
            $series = $this->liveSeriesOf($item);

            if ($series !== null && $scope === Scope::Future) {
                [$rows] = $this->splitSeries($series, (string) $item->occurrenceDate(), null);
                // The last row is the ended or deleted series.
                $last = end($rows) ?: throw new LogicException('A split always writes the series.');

                return [$rows, $last];
            }

            if ($item->kind === ItemKind::Occurrence) {
                $row = $this->tombstone($this->materialize($this->seriesOfOccurrence($item), (string) $item->occurrenceDate()));

                return [[$row], $row];
            }

            $row = $this->tombstone($item->task);

            if ($item->kind === ItemKind::Series) {
                return [[...$this->tombstonedExceptions($item->id()), $row], $row];
            }

            return [[$row], $row];
        });
    }

    /**
     * Brings back a soft-deleted task (undo of a single delete) with a newer change, so the restore also wins on
     * other devices. With an occurrence id it restores that occurrence's exception.
     */
    public function restoreTask(string $id): PlannerItem
    {
        return $this->write(function () use ($id) {
            $occurrence = PlannerItem::parseOccurrenceId($id);
            $task = $occurrence !== null
                ? $this->queries->exception($occurrence['seriesId'], $occurrence['date'])
                : $this->queries->row($id);

            if ($task === null) {
                throw TaskNotFound::withId($id);
            }

            $row = [...$task, 'updated_at' => $this->nextTimestamp($task['updated_at']), 'deleted_at' => null];

            return [[$row], PlannerItem::fromRow($row)];
        });
    }

    /**
     * Moves a task to a day or into Someday (`$date` null). It lands right before `$beforeId` and/or right after
     * `$afterId`; a neighbour that is not in the target list is ignored, and with none it goes to the end. Moving an
     * occurrence writes its exception; a series row cannot be moved.
     */
    public function moveTask(string $id, ?string $date, ?string $beforeId = null, ?string $afterId = null): PlannerItem
    {
        return $this->write(function () use ($id, $date, $beforeId, $afterId) {
            $item = $this->getLive($id);

            if ($item->kind === ItemKind::Series) {
                throw new InvalidTaskChange('Move an occurrence, not its series.');
            }

            $slot = $this->slotIn($date, $afterId, $beforeId, exclude: [$id, $item->id()]);
            $base = $item->kind === ItemKind::Occurrence
                ? $this->materialize($this->seriesOfOccurrence($item), (string) $item->occurrenceDate())
                : $item->task;
            $row = [...$base, ...$slot, 'updated_at' => $this->nextTimestamp($base['updated_at'])];

            return [[$row], PlannerItem::fromRow($row)];
        });
    }

    /**
     * Copies a task right after the original: same content and done state, new ids for the task and its subtasks.
     * The copy is always a plain task; a generated occurrence used as the source gets its exception row.
     *
     * @return TaskRecord
     */
    public function duplicateTask(string $id): array
    {
        return $this->write(function () use ($id) {
            $item = $this->getLive($id);
            $siblings = $this->queries->listIn($item->task['date']);
            $index = array_search($item->id(), array_map(fn (PlannerItem $sibling) => $sibling->id(), $siblings), true);
            $next = $index === false ? ($siblings[0] ?? null) : ($siblings[$index + 1] ?? null);
            $source = $item->kind === ItemKind::Occurrence
                ? $this->materialize($this->seriesOfOccurrence($item), (string) $item->occurrenceDate())
                : $item->task;
            $copy = [
                ...$this->plainCopy($source),
                ...$this->slotBetween($item->task['date'], $item->task, $next?->task),
                'subtasks' => array_map(fn (array $subtask) => [...$subtask, 'id' => self::newId()], $item->task['subtasks']),
            ];

            return [$item->kind === ItemKind::Occurrence ? [$source, $copy] : [$copy], $copy];
        });
    }

    /**
     * Sets or removes the repeat rule (stored in canonical form; an invalid rule throws before anything is written).
     *
     * - Plain task: a rule turns it into a series anchored at its date (a Someday task cannot repeat); null does
     *   nothing.
     * - Series row: replaces the rule; null turns it into a plain task and deletes its exceptions.
     * - Occurrence or exception, scope `future` (the default): the series ends the day before the occurrence; with a
     *   rule, a new series with this item's content starts on the occurrence's date; with null, this item becomes a
     *   plain task. Scope `this`: this item leaves the series, which keeps going with a deleted exception hiding its
     *   date; with a rule it starts a new, independent series on that date, with null it becomes a plain task.
     *
     * Returns what now stands for the item: its occurrence on the anchor date when the rule produces one, else the
     * series row, or the plain task.
     *
     * @param  array<string, mixed>|null  $recurrence
     */
    public function setRecurrence(string $id, ?array $recurrence, Scope $scope = Scope::Future): PlannerItem
    {
        return $this->write(function () use ($id, $recurrence, $scope) {
            $item = $this->getLive($id);
            $series = $this->liveSeriesOf($item);

            if ($series !== null) {
                $from = (string) $item->occurrenceDate();

                if ($recurrence !== null) {
                    $rule = RecurrenceRule::normalize($recurrence, $from);

                    if ($scope === Scope::This) {
                        // This item starts a series of its own; the old one keeps going without it (a deleted
                        // exception hides its date).
                        $own = $this->newSeries($item->task, $from, $rule);
                        $hidden = $this->tombstone($item->kind === ItemKind::Exception ? $item->task : $this->materialize($series, $from));

                        return [[$hidden, $own], $this->representative($own, $from)];
                    }

                    [$rows, $successor] = $this->splitSeries($series, $from, $this->newSeries($item->task, $from, $rule));

                    return [$rows, $this->representative($successor ?? throw new LogicException('A split with a replacement has a successor.'), $from)];
                }

                $plain = $item->kind === ItemKind::Exception ? $this->detached($item->task) : $this->plainCopy($item->task);

                if ($scope === Scope::This) {
                    // A deleted exception keeps the occurrence from coming back.
                    return [[$plain, $this->tombstone($this->materialize($series, $from))], PlannerItem::fromRow($plain)];
                }

                [$rows] = $this->splitSeries($series, $from, null, $item->id());

                return [[...$rows, $plain], PlannerItem::fromRow($plain)];
            }

            if ($item->kind === ItemKind::Series) {
                if ($recurrence !== null) {
                    $next = [
                        ...$item->task,
                        'recurrence' => RecurrenceRule::normalize($recurrence, (string) $item->task['date']),
                        'updated_at' => $this->nextTimestamp($item->task['updated_at']),
                    ];

                    return [[$next], PlannerItem::fromRow($next)];
                }

                $plain = $this->detached($item->task);

                return [[...$this->tombstonedExceptions($item->id()), $plain], PlannerItem::fromRow($plain)];
            }

            if ($recurrence === null) {
                return [[], $item];
            }

            if ($item->task['date'] === null) {
                throw new InvalidTaskChange('A Someday task cannot repeat.');
            }

            // A plain task, or an exception whose series is gone.
            $row = [
                ...$this->detached($item->task),
                'recurrence' => RecurrenceRule::normalize($recurrence, $item->task['date']),
                'done' => false,
                'done_at' => null,
            ];

            return [[$row], $this->representative($row, $item->task['date'])];
        });
    }

    /**
     * Moves every unfinished plain task dated before `$today` to `$today`, after the tasks already there (occurrences
     * included), oldest day first and in each day's order. Recurring tasks never move. Returns how many moved.
     */
    public function carryOverTasks(string $today): int
    {
        $today = (string) $this->checkedDate($today);

        return $this->write(function () use ($today) {
            $past = Task::query()
                ->where('user_id', $this->user->id)
                ->where('date', '<', $today)
                ->whereNull('deleted_at')
                ->where('done', false)
                ->whereNull('recurrence')
                ->whereNull('series_id')
                ->get()
                ->map(fn (Task $task) => $task->toRecord())
                ->filter(fn (array $task) => self::isCarriedOver($task, $today))
                ->sort(TaskOrder::compareCarryOverOrder(...))
                ->values();
            $todays = $this->queries->listIn($today);
            $after = $todays === [] ? null : $todays[array_key_last($todays)]->task['position'];
            $rows = [];

            foreach ($past as $task) {
                $after = TaskOrder::positionBetween($after, null);
                $rows[] = [...$task, 'date' => $today, 'position' => $after, 'updated_at' => $this->nextTimestamp($task['updated_at'])];
            }

            return [$rows, count($rows)];
        });
    }

    /**
     * Whether "Move unfinished tasks to today" moves `$task` (the client's `isCarriedOver`): a live, unfinished,
     * plain task dated before `$today`.
     *
     * @param  TaskRecord  $task
     */
    public static function isCarriedOver(array $task, string $today): bool
    {
        return $task['deleted_at'] === null
            && ! $task['done']
            && $task['date'] !== null
            && $task['date'] < $today
            && $task['recurrence'] === null
            && $task['series_id'] === null;
    }

    /**
     * Gives an occurrence its exception row, unchanged (the series' content on its date), and returns it; any other
     * item is returned as is. For callers that need a row id for what is on screen.
     */
    public function materializeOccurrence(string $id): PlannerItem
    {
        return $this->write(function () use ($id) {
            $item = $this->getLive($id);

            if ($item->kind !== ItemKind::Occurrence) {
                return [[], $item];
            }

            $row = $this->materialize($this->seriesOfOccurrence($item), (string) $item->occurrenceDate());

            return [[$row], PlannerItem::fromRow($row)];
        });
    }

    /**
     * Adds the tasks of an export file next to the existing ones (see {@see TaskImport}): new ids, positions after
     * each list's last task. Nothing that exists changes.
     *
     * @param  array<mixed>|string  $file  The file's JSON, or it decoded.
     *
     * @throws ImportError When the file cannot be imported.
     */
    public function import(array|string $file): ImportResult
    {
        $tasks = TaskImport::parse($file);

        return $this->write(function () use ($tasks) {
            $plan = TaskImport::plan($tasks, $this->queries, $this->nextTimestamp(), self::newId(...));

            return [$plan->tasks, $plan];
        });
    }

    /**
     * Runs `$build` in one transaction that first takes the sync write lock, then validates and writes the rows it
     * returns (the last one per id wins) with fresh versions, and returns its result.
     *
     * @template T
     *
     * @param  Closure(): array{0: list<TaskRecord>, 1: T}  $build
     * @return T
     */
    private function write(Closure $build): mixed
    {
        $written = false;

        $result = DB::transaction(function () use ($build, &$written) {
            SyncVersions::lock();

            [$rows, $result] = $build();
            $records = [];

            foreach ($rows as $row) {
                $records[$row['id']] = $row;
            }

            if ($records === []) {
                return $result;
            }

            try {
                TaskRecordRules::validate(array_values($records));
            } catch (ValidationException $e) {
                throw new InvalidTaskChange($e->getMessage(), previous: $e);
            }

            $version = SyncVersions::reserve(count($records));
            $stored = Task::query()->whereIn('id', array_keys($records))->get()->keyBy('id');

            foreach ($records as $id => $record) {
                $task = $stored->get($id) ?? new Task;

                if ($task->exists && $task->user_id !== $this->user->id) {
                    throw TaskNotFound::withId((string) $id);
                }

                $task->fill($record);
                $task->user_id = $this->user->id;
                $task->version = $version++;
                $task->save();
            }

            $written = true;

            return $result;
        });

        if ($written) {
            SyncGoogleCalendar::dispatchFor($this->user, SyncGoogleCalendar::DEBOUNCE_SECONDS);
        }

        return $result;
    }

    /**
     * Edits an item: on an occurrence, scope `this` writes an exception and `future` splits the series at its date.
     *
     * @param  Closure(PlannerItem): TaskPatch  $change
     */
    private function edit(string $id, Closure $change, Scope $scope): PlannerItem
    {
        return $this->write(function () use ($id, $change, $scope) {
            $item = $this->getLive($id);
            $patch = $change($item);
            $series = $this->liveSeriesOf($item);

            if ($series !== null && $scope === Scope::Future) {
                $from = (string) $item->occurrenceDate();
                $content = $this->patched($item->task, self::seriesPatch($patch));
                [$rows, $successor] = $this->splitSeries($series, $from, $this->newSeries($content, $from, self::ruleOf($series)));

                return [$rows, $this->representative($successor ?? throw new LogicException('A split with a replacement has a successor.'), $from)];
            }

            $row = match ($item->kind) {
                ItemKind::Occurrence => $this->patched($this->materialize($this->seriesOfOccurrence($item), (string) $item->occurrenceDate()), $patch),
                ItemKind::Series => $this->patched($item->task, self::seriesPatch($patch)),
                default => $this->patched($item->task, $patch),
            };

            return [[$row], PlannerItem::fromRow($row)];
        });
    }

    private function getLive(string $id): PlannerItem
    {
        return $this->queries->find($id) ?? throw TaskNotFound::withId($id);
    }

    /**
     * The live series of an occurrence (it always has one).
     *
     * @return TaskRecord
     */
    private function seriesOfOccurrence(PlannerItem $item): array
    {
        $seriesId = (string) $item->seriesId();

        return $this->queries->series($seriesId) ?? throw new TaskNotFound("Series {$seriesId} does not exist.");
    }

    /**
     * The series of an occurrence or exception, when it is still live.
     *
     * @return TaskRecord|null
     */
    private function liveSeriesOf(PlannerItem $item): ?array
    {
        return $item->belongsToSeries() ? $this->queries->series((string) $item->seriesId()) : null;
    }

    /**
     * The slot right before `$beforeId` and/or right after `$afterId` in the list of `$date` (null: Someday), leaving
     * out the rows in `$exclude` (the task being moved) and counting `$pending` rows not written yet. A neighbour that
     * is not in the list is ignored; with no usable neighbour the slot is at the end.
     *
     * @param  list<string>  $exclude
     * @param  list<TaskRecord>  $pending
     * @return Slot
     */
    private function slotIn(?string $date, ?string $afterId, ?string $beforeId, array $exclude = [], array $pending = []): array
    {
        $date = $this->checkedDate($date);
        $siblings = array_map(fn (PlannerItem $item) => $item->task, $this->queries->listIn($date));
        $same = array_filter($pending, fn (array $row) => $row['date'] === $date);

        if ($same !== []) {
            $siblings = [...$siblings, ...$same];
            usort($siblings, $date === null ? TaskOrder::compareSomedayOrder(...) : TaskOrder::compareTaskOrder(...));
        }

        $siblings = array_values(array_filter($siblings, fn (array $sibling) => ! in_array($sibling['id'], $exclude, true)));
        $ids = array_map(fn (array $sibling) => $sibling['id'], $siblings);
        $indexOf = function (?string $id) use ($ids): int {
            $index = $id === null ? false : array_search($id, $ids, true);

            return $index === false ? -1 : $index;
        };

        $afterIndex = $indexOf($afterId);
        $beforeIndex = $indexOf($beforeId);

        if ($afterIndex === -1 && $beforeIndex === -1) {
            $afterIndex = count($siblings) - 1;
            $beforeIndex = count($siblings);
        } elseif ($beforeIndex === -1) {
            $beforeIndex = $afterIndex + 1;
        } elseif ($afterIndex === -1) {
            $afterIndex = $beforeIndex - 1;
        }

        return $this->slotBetween($date, $siblings[$afterIndex] ?? null, $siblings[$beforeIndex] ?? null);
    }

    /**
     * The placement fields of a task that goes right after `$after` and before `$before` in the list of `$date`.
     *
     * @param  array{someday_column: int|null, position: string}|null  $after
     * @param  array{someday_column: int|null, position: string}|null  $before
     * @return Slot
     */
    private function slotBetween(?string $date, ?array $after, ?array $before): array
    {
        if ($date === null) {
            return ['date' => null, ...TaskOrder::somedayKeyBetween($after, $before)];
        }

        return [
            'date' => $date,
            'someday_column' => null,
            'position' => TaskOrder::positionBetween($after['position'] ?? null, $before['position'] ?? null),
        ];
    }

    /**
     * `$task` with `$patch` applied and a newer `updated_at`, keeping `done_at` consistent with `done`.
     *
     * @param  TaskRecord  $task
     * @param  TaskPatch  $patch
     * @return TaskRecord
     */
    private function patched(array $task, array $patch): array
    {
        $next = [...$task, 'updated_at' => $this->nextTimestamp($task['updated_at'])];

        foreach (self::PATCHABLE_FIELDS as $field) {
            if (array_key_exists($field, $patch)) {
                $value = $patch[$field];
                $next[$field] = $value instanceof TaskColor ? $value->value : $value;
            }
        }

        if ($next['done'] !== $task['done']) {
            $next['done_at'] = $next['done'] ? $next['updated_at'] : null;
        }

        /** @var TaskRecord $next */
        return $next;
    }

    /**
     * A series is never done: its occurrences are, one by one.
     *
     * @param  TaskPatch  $patch
     * @return TaskPatch
     */
    private static function seriesPatch(array $patch): array
    {
        unset($patch['done']);

        return $patch;
    }

    /**
     * @param  TaskRecord  $task
     * @return TaskRecord
     */
    private function tombstone(array $task): array
    {
        $now = $this->nextTimestamp($task['updated_at']);

        return [...$task, 'updated_at' => $now, 'deleted_at' => $now];
    }

    /**
     * Tombstones of the live exception rows of a series.
     *
     * @return list<TaskRecord>
     */
    private function tombstonedExceptions(string $seriesId): array
    {
        return array_values(array_map(
            $this->tombstone(...),
            array_filter($this->queries->exceptions($seriesId), fn (array $row) => $row['deleted_at'] === null),
        ));
    }

    /**
     * A new row: fresh id and timestamps.
     *
     * @param  TaskRecord  $task
     * @return TaskRecord
     */
    private function fresh(array $task): array
    {
        $now = $this->nextTimestamp();

        return [...$task, 'id' => self::newId(), 'created_at' => $now, 'updated_at' => $now, 'deleted_at' => null];
    }

    /**
     * The exception row of an occurrence, with nothing changed yet.
     *
     * @param  TaskRecord  $series
     * @return TaskRecord
     */
    private function materialize(array $series, string $date): array
    {
        return $this->fresh(PlannerItem::occurrence($series, $date)->task);
    }

    /**
     * A new plain row with the content of `$task`.
     *
     * @param  TaskRecord  $task
     * @return TaskRecord
     */
    private function plainCopy(array $task): array
    {
        return [...$this->fresh($task), 'recurrence' => null, 'series_id' => null, 'occurrence_date' => null];
    }

    /**
     * `$task` turned into a plain row (same id).
     *
     * @param  TaskRecord  $task
     * @return TaskRecord
     */
    private function detached(array $task): array
    {
        return [
            ...$task,
            'recurrence' => null,
            'series_id' => null,
            'occurrence_date' => null,
            'updated_at' => $this->nextTimestamp($task['updated_at']),
        ];
    }

    /**
     * A new series row anchored at `$date` with the content of `$task`.
     *
     * @param  TaskRecord  $task
     * @param  Recurrence  $recurrence
     * @return TaskRecord
     */
    private function newSeries(array $task, string $date, array $recurrence): array
    {
        return [
            ...$this->plainCopy($task),
            'date' => $date,
            'someday_column' => null,
            'done' => false,
            'done_at' => null,
            'recurrence' => $recurrence,
        ];
    }

    /**
     * Ends `$series` before `$from` ("this and all future"): its exceptions dated `$from` or later are deleted (except
     * `$keepId`), and it gets `until` the day before, or is deleted when nothing would be left (`$from` is on or before
     * its first occurrence). `$replacement`, a series row with a new id, takes over from `$from`; when the old series
     * would be empty, the old row takes the replacement's content instead (same id).
     *
     * @param  TaskRecord  $series
     * @param  TaskRecord|null  $replacement
     * @return array{0: list<TaskRecord>, 1: TaskRecord|null} The rows to write and the series that now covers `$from`.
     */
    private function splitSeries(array $series, string $from, ?array $replacement, ?string $keepId = null): array
    {
        $rows = array_values(array_map(
            $this->tombstone(...),
            array_filter(
                $this->queries->exceptions($series['id'], $from),
                fn (array $row) => $row['deleted_at'] === null && $row['id'] !== $keepId,
            ),
        ));
        $recurrence = self::ruleOf($series);

        if (RecurrenceRule::startsSeries($recurrence, (string) $series['date'], $from)) {
            if ($replacement === null) {
                return [[...$rows, $this->tombstone($series)], null];
            }

            $successor = [
                ...$replacement,
                'id' => $series['id'],
                'created_at' => $series['created_at'],
                'updated_at' => $this->nextTimestamp($series['updated_at']),
            ];

            return [[...$rows, $successor], $successor];
        }

        $ended = [
            ...$series,
            'recurrence' => [...$recurrence, 'until' => RecurrenceRule::addDays($from, -1)],
            'updated_at' => $this->nextTimestamp($series['updated_at']),
        ];

        return [[...$rows, $ended, ...($replacement === null ? [] : [$replacement])], $replacement];
    }

    /**
     * What stands for the task the user acted on after a change to its series: the series' occurrence on `$date` when
     * it has one, else the series itself.
     *
     * @param  TaskRecord  $row
     */
    private function representative(array $row, string $date): PlannerItem
    {
        $item = PlannerItem::fromRow($row);

        return $item->kind === ItemKind::Series
            && RecurrenceRule::occursOn(self::ruleOf($row), (string) $row['date'], $date)
            ? PlannerItem::occurrence($row, $date)
            : $item;
    }

    /**
     * An ISO-8601 UTC timestamp (ms) for `updated_at`: now, but strictly after any timestamp handed out before and
     * after `$previous`, so a server change always wins last-write-wins against the version it replaces.
     */
    private function nextTimestamp(?string $previous = null): string
    {
        $next = max(CarbonImmutable::now('UTC')->getTimestampMs(), $this->lastTimestamp + 1);

        if ($previous !== null) {
            $next = max($next, CarbonImmutable::parse($previous, 'UTC')->getTimestampMs() + 1);
        }

        $this->lastTimestamp = $next;

        return CarbonImmutable::createFromTimestampMsUTC($next)->format(UtcMillisDateTime::WIRE_FORMAT);
    }

    /**
     * The rule of a series row.
     *
     * @param  TaskRecord  $series
     * @return Recurrence
     */
    private static function ruleOf(array $series): array
    {
        return $series['recurrence'] ?? throw new InvalidTaskChange("Task {$series['id']} does not repeat.");
    }

    private static function newId(): string
    {
        return (string) Str::uuid7();
    }

    /**
     * @throws InvalidTaskChange When `$date` is not a calendar date.
     */
    private function checkedDate(?string $date): ?string
    {
        if ($date !== null && ! RecurrenceRule::isDateKey($date)) {
            throw new InvalidTaskChange("Invalid date: {$date}. Use YYYY-MM-DD.");
        }

        return $date;
    }
}
