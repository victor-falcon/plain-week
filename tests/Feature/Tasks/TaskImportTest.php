<?php

use App\Models\Task;
use App\Models\User;
use App\Tasks\ImportError;
use App\Tasks\Occurrence;
use App\Tasks\PlannerItem;
use App\Tasks\TaskImport;
use App\Tasks\TaskOccurrences;
use App\Tasks\TaskRepository;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;

// The cases mirror the import part of resources/js/lib/transfer/transfer.test.ts (planImport, backupRows and
// parseImport), so a file imported through the server lands like one imported in the browser.

uses(RefreshDatabase::class);

const IMPORT_MON = '2026-10-12';
const IMPORT_TUE = '2026-10-13';
const IMPORT_WED = '2026-10-14';
const IMPORT_FRI = '2026-10-16';
const IMPORT_NEXT_MON = '2026-10-19';

beforeEach(function () {
    $this->user = User::factory()->create();
    $this->tasks = TaskRepository::for($this->user);
});

/**
 * A task with the wire shape (like the client's `makeTask`).
 *
 * @param  array<string, mixed>  $overrides
 * @return array<string, mixed>
 */
function importTask(array $overrides = []): array
{
    return [
        'id' => (string) Str::uuid(),
        'text' => 'Task',
        'date' => IMPORT_MON,
        'someday_column' => null,
        'position' => 'a0',
        'done' => false,
        'done_at' => null,
        'color' => 'none',
        'time' => null,
        'notes' => '',
        'subtasks' => [],
        'created_at' => '2026-10-12T10:00:00.000Z',
        'updated_at' => '2026-10-12T10:00:00.000Z',
        'deleted_at' => null,
        'recurrence' => null,
        'series_id' => null,
        'occurrence_date' => null,
        ...$overrides,
    ];
}

/**
 * @param  list<mixed>  $tasks
 * @return array<string, mixed>
 */
function importFile(array $tasks): array
{
    return [
        'format' => 'plain-week',
        'version' => 1,
        'exported_at' => '2026-10-15T08:00:00.000Z',
        'app_version' => '0.0.3',
        'tasks' => $tasks,
    ];
}

/**
 * The export file of a user's tasks, like the client's `buildExport`.
 *
 * @return array<string, mixed>
 */
function exportOf(User $user): array
{
    return importFile(TaskImport::backupRows(Task::query()->where('user_id', $user->id)->get()->map->toRecord()->all()));
}

/**
 * 'text[✓]@list:color' of the two weeks from MON and the Someday list, in display order.
 *
 * @return list<string>
 */
function importSnapshot(User $user): array
{
    $week = app(TaskOccurrences::class)
        ->forUser($user, CarbonImmutable::parse(IMPORT_MON), CarbonImmutable::parse('2026-10-25'))
        ->map(fn (Occurrence $item) => $item->text.($item->done ? '✓' : '')."@{$item->date}:{$item->color->value}")
        ->all();
    $someday = array_map(fn (PlannerItem $item) => "{$item->task['text']}@someday", TaskRepository::for($user)->listTasksIn(null));

    return [...$week, ...$someday];
}

describe('backupRows', function () {
    it('leaves out tombstones, exceptions of deleted series and losing duplicates', function () {
        $exception = fn (string $id, string $updatedAt, bool $deleted = false) => importTask([
            'id' => $id,
            'series_id' => 'series',
            'occurrence_date' => IMPORT_MON,
            'updated_at' => $updatedAt,
            'deleted_at' => $deleted ? $updatedAt : null,
        ]);
        $rows = [
            importTask(['id' => 'series', 'recurrence' => ['type' => 'weekly', 'weekdays' => [1]]]),
            importTask(['id' => 'deleted-series', 'recurrence' => ['type' => 'weekly', 'weekdays' => [2]], 'deleted_at' => '2026-10-13T00:00:00.000Z']),
            importTask(['id' => 'plain']),
            importTask(['id' => 'gone', 'deleted_at' => '2026-10-13T00:00:00.000Z']),
            importTask(['id' => 'of-deleted', 'series_id' => 'deleted-series', 'occurrence_date' => IMPORT_TUE]),
            $exception('old', '2026-10-12T10:00:00.000Z'),
            $exception('newest', '2026-10-12T11:00:00.000Z'),
            importTask(['id' => 'deleted-occurrence', 'series_id' => 'series', 'occurrence_date' => '2026-10-19', 'deleted_at' => '2026-10-13T00:00:00.000Z']),
            importTask(['id' => 'orphan', 'series_id' => 'not-here', 'occurrence_date' => IMPORT_WED]),
        ];

        $ids = array_column(TaskImport::backupRows($rows), 'id');
        sort($ids);

        expect($ids)->toBe(['deleted-occurrence', 'newest', 'orphan', 'plain', 'series']);
    });
});

describe('round trip', function () {
    it('imports an export into an empty planner with the same planner and new ids', function () {
        $milk = $this->tasks->createTask([
            'text' => 'Buy milk',
            'date' => IMPORT_MON,
            'color' => 'cornflower',
            'time' => '09:30',
            'notes' => 'Oat',
            'subtasks' => [['id' => 's1', 'text' => 'Oat milk', 'done' => true]],
        ]);
        $this->tasks->createTask(['text' => 'Read', 'date' => IMPORT_MON]);
        $this->tasks->toggleDone($milk['id']);
        $this->tasks->createTask(['text' => 'Idea', 'date' => null]);
        $gone = $this->tasks->createTask(['text' => 'Gone', 'date' => IMPORT_TUE]);
        $this->tasks->deleteTask($gone['id']);

        $gym = $this->tasks->createTask(['text' => 'Gym', 'date' => IMPORT_MON]);
        $this->tasks->setRecurrence($gym['id'], ['type' => 'weekly', 'weekdays' => [1, 3, 5]]);
        $this->tasks->toggleDone(Occurrence::idFor($gym['id'], IMPORT_WED));
        $this->tasks->updateTask(Occurrence::idFor($gym['id'], IMPORT_FRI), ['color' => 'pink']);
        $this->tasks->deleteTask(Occurrence::idFor($gym['id'], IMPORT_NEXT_MON));
        $this->tasks->moveTask(Occurrence::idFor($gym['id'], IMPORT_MON), IMPORT_TUE);

        $before = importSnapshot($this->user);
        $exported = exportOf($this->user);
        $oldIds = array_column($exported['tasks'], 'id');
        $other = User::factory()->create();

        $result = TaskRepository::for($other)->import(json_encode($exported, JSON_THROW_ON_ERROR));

        expect(importSnapshot($other))->toBe($before)
            ->and($before)->toContain('Gym✓@'.IMPORT_WED.':none')
            ->and($before)->not->toContain('Gym@'.IMPORT_NEXT_MON.':none');

        $rows = Task::query()->where('user_id', $other->id)->get()->map->toRecord()->all();

        expect($rows)->toHaveCount(count($exported['tasks']))
            ->and($result->tasks)->toHaveCount(count($rows))
            ->and(array_intersect(array_column($rows, 'id'), $oldIds))->toBe([])
            ->and(array_filter($rows, fn (array $row) => $row['text'] === 'Gone'))->toBe([]);

        $series = collect($rows)->first(fn (array $row) => $row['recurrence'] !== null);
        $exceptions = array_filter($rows, fn (array $row) => $row['series_id'] !== null);

        expect($series['id'][14])->toBe('7')
            ->and($exceptions)->toHaveCount(4)
            ->and(collect($exceptions)->every(fn (array $row) => $row['series_id'] === $series['id']))->toBeTrue();

        $copy = collect($rows)->first(fn (array $row) => $row['text'] === 'Buy milk');
        $original = collect($exported['tasks'])->first(fn (array $row) => $row['id'] === $milk['id']);

        expect($copy)->toMatchArray([
            'done' => true,
            'done_at' => $original['done_at'],
            'time' => '09:30',
            'notes' => 'Oat',
            'subtasks' => [['id' => 's1', 'text' => 'Oat milk', 'done' => true]],
        ])
            ->and($copy['created_at'])->toBe($copy['updated_at'])
            ->and($copy['created_at'] > $original['updated_at'])->toBeTrue();
    });

    it('round-trips a series that repeats every N days', function () {
        $water = $this->tasks->createTask(['text' => 'Water plants', 'date' => IMPORT_MON]);
        $this->tasks->setRecurrence($water['id'], ['type' => 'daily', 'every' => 3]);
        $this->tasks->updateTask(Occurrence::idFor($water['id'], '2026-10-15'), ['color' => 'green']);

        $before = importSnapshot($this->user);
        $exported = exportOf($this->user);
        $other = User::factory()->create();

        expect(collect($exported['tasks'])->firstWhere('id', $water['id'])['recurrence'])->toBe(['type' => 'daily', 'every' => 3]);

        TaskRepository::for($other)->import($exported);

        expect(importSnapshot($other))->toBe($before)
            ->and($before)->toContain('Water plants@'.IMPORT_MON.':none', 'Water plants@2026-10-15:green', 'Water plants@2026-10-18:none');
    });

    it('adds to the existing tasks and leaves them unchanged', function () {
        $task = $this->tasks->createTask(['text' => 'Mine', 'date' => IMPORT_MON]);

        $this->tasks->import(exportOf($this->user));

        expect(Task::query()->findOrFail($task['id'])->toRecord())->toBe($task)
            ->and(importSnapshot($this->user))->toBe(['Mine@'.IMPORT_MON.':none', 'Mine@'.IMPORT_MON.':none']);
    });
});

describe('planImport', function () {
    it('appends after the existing tasks of each list, keeping the file order', function () {
        $this->tasks->createTask(['text' => 'Existing', 'date' => IMPORT_MON]);
        $idea = $this->tasks->createTask(['text' => 'Existing idea', 'date' => null]);
        // The last Someday task sits in column 2 (an older version's row).
        Task::query()->whereKey($idea['id'])->update(['someday_column' => 2]);

        $this->tasks->import(importFile([
            importTask(['id' => 'b', 'text' => 'Second', 'position' => 'a2']),
            importTask(['id' => 'a', 'text' => 'First', 'position' => 'a1']),
            importTask(['id' => 'c', 'text' => 'Later idea', 'date' => null, 'someday_column' => 0, 'position' => 'Zz']),
        ]));

        expect(importSnapshot($this->user))->toBe([
            'Existing@'.IMPORT_MON.':none',
            'First@'.IMPORT_MON.':none',
            'Second@'.IMPORT_MON.':none',
            'Existing idea@someday',
            'Later idea@someday',
        ])
            ->and(Task::query()->where('text', 'Later idea')->value('someday_column'))->toBe(2);
    });

    it('turns an exception whose series is not in the file into a plain task', function () {
        $result = $this->tasks->import(importFile([
            importTask(['id' => 'moved', 'text' => 'Moved gym', 'date' => IMPORT_TUE, 'series_id' => 'missing', 'occurrence_date' => IMPORT_MON]),
        ]));

        expect([$result->taskCount, $result->recurringCount])->toBe([1, 0])
            ->and(Task::query()->get()->map->toRecord()->all())->toHaveCount(1)
            ->and(Task::query()->sole()->toRecord())->toMatchArray([
                'text' => 'Moved gym',
                'date' => IMPORT_TUE,
                'series_id' => null,
                'occurrence_date' => null,
            ]);
    });

    it('drops the exceptions of a series deleted in the file', function () {
        $result = $this->tasks->import(importFile([
            importTask(['id' => 'series', 'recurrence' => ['type' => 'weekly', 'weekdays' => [1]], 'deleted_at' => '2026-10-13T00:00:00.000Z']),
            importTask(['id' => 'exception', 'series_id' => 'series', 'occurrence_date' => IMPORT_MON]),
            importTask(['id' => 'plain', 'text' => 'Plain']),
        ]));

        expect([$result->taskCount, $result->recurringCount])->toBe([1, 0])
            ->and(Task::query()->pluck('text')->all())->toBe(['Plain']);
    });

    it('counts series as recurring and exceptions as part of their series', function () {
        $result = $this->tasks->import(importFile([
            importTask(['id' => 'series', 'recurrence' => ['type' => 'monthly', 'day' => 31]]),
            importTask(['id' => 'exception', 'series_id' => 'series', 'occurrence_date' => '2026-10-31', 'date' => '2026-10-30']),
            importTask(['id' => 'plain']),
        ]));

        expect([$result->taskCount, $result->recurringCount])->toBe([2, 1])
            ->and(TaskImport::summarize(TaskImport::parse(importFile([]))))->toBe(['taskCount' => 0, 'recurringCount' => 0])
            ->and(array_column($result->tasks, 'series_id'))->toBe([null, null, $result->tasks[0]['id']]);
    });
});

describe('parseImport', function () {
    it('refuses a file that is not a Plain Week export', function (string $text, string $message) {
        expect(fn () => TaskImport::parse($text))->toThrow(ImportError::class, $message);
    })->with([
        ['not json', 'This file is not valid JSON.'],
        ['[]', 'This is not a Plain Week export file.'],
        ['{"format":"tweek"}', 'This is not a Plain Week export file.'],
        ['{"format":"plain-week","version":2,"tasks":[]}', 'This file comes from a newer version of Plain Week (format version 2). Update Plain Week to import it.'],
        ['{"format":"plain-week","version":"1","tasks":[]}', 'Unsupported export format version: "1".'],
        ['{"format":"plain-week","version":1}', 'This file has no task list.'],
    ]);

    it('refuses an invalid task with the push rules', function (array $overrides) {
        expect(fn () => TaskImport::parse(importFile([importTask($overrides)])))->toThrow(ImportError::class, 'Task 1: ');
    })->with([
        [['color' => 'red']],
        [['text' => null]],
        [['done' => 1]],
        [['date' => '2026-02-30']],
        [['date' => null]],
        [['time' => '24:00']],
        [['updated_at' => '2026-10-12T10:00:00Z']],
        [['subtasks' => [['id' => 's', 'text' => 'x']]]],
        [['recurrence' => ['type' => 'weekly', 'weekdays' => [3, 1]]]],
        [['recurrence' => ['type' => 'yearly']]],
        [['recurrence' => ['type' => 'monthly', 'day' => 1, 'interval' => 2]]],
        [['recurrence' => ['type' => 'daily']]],
        [['recurrence' => ['type' => 'daily', 'every' => 366]]],
        [['recurrence' => ['type' => 'daily', 'every' => 2.5]]],
        [['recurrence' => ['type' => 'daily', 'every' => 2, 'day' => 1]]],
        [['recurrence' => ['type' => 'monthly', 'day' => 1, 'every' => 2]]],
        [['recurrence' => ['type' => 'monthly', 'day' => 1], 'date' => null, 'someday_column' => 0]],
        [['recurrence' => ['type' => 'monthly', 'day' => 1, 'until' => '2026-01-01']]],
        [['series_id' => 'x']],
        [['position' => str_repeat('a', 256)]],
    ]);

    it('refuses a file that is too large', function () {
        expect(fn () => TaskImport::parse(str_repeat('x', TaskImport::MAX_BYTES + 1)))
            ->toThrow(ImportError::class, 'This file is too large to import (more than 50 MB).');
    });

    it('refuses duplicate ids and rows that are not objects', function () {
        expect(fn () => TaskImport::parse(importFile([importTask(['id' => 'a']), importTask(['id' => 'a'])])))
            ->toThrow(ImportError::class, 'Task 2: "id" is used by another task in the file.')
            ->and(fn () => TaskImport::parse(importFile([importTask(), 'task'])))
            ->toThrow(ImportError::class, 'Task 2 is not an object.');
    });

    it('reads a file and drops unknown keys', function () {
        $task = importTask(['date' => null, 'someday_column' => 2]);

        expect(TaskImport::parse(json_encode(importFile([[...$task, 'version' => 7, 'extra' => true]]), JSON_THROW_ON_ERROR)))->toEqual([$task]);
    });

    it('writes nothing when the file is refused', function () {
        expect(fn () => $this->tasks->import(importFile([importTask(), importTask(['color' => 'red'])])))->toThrow(ImportError::class)
            ->and(Task::query()->count())->toBe(0);
    });
});
