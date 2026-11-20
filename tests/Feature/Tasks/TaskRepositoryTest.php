<?php

use App\Models\Task;
use App\Models\User;
use App\Tasks\InvalidTaskChange;
use App\Tasks\PlannerItem;
use App\Tasks\Scope;
use App\Tasks\TaskNotFound;
use App\Tasks\TaskRepository;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;

// The cases mirror resources/js/lib/db/tasks.test.ts and carry-over.test.ts, so the server changes tasks exactly like
// the planner does.

uses(RefreshDatabase::class);

const REPO_DAY = '2026-10-12';
const REPO_OTHER_DAY = '2026-10-13';

beforeEach(function () {
    $this->user = User::factory()->create();
    $this->tasks = TaskRepository::for($this->user);
});

/**
 * @return list<string>
 */
function repoTexts(?string $date): array
{
    return array_map(fn (PlannerItem $item) => $item->task['text'], test()->tasks->listTasksIn($date));
}

/**
 * @return array<string, mixed>
 */
function repoRow(string $id): array
{
    return Task::query()->findOrFail($id)->toRecord();
}

/**
 * Someday tasks spread over the columns, as older versions wrote them.
 *
 * @param  list<int>  $columns
 * @return list<array<string, mixed>>
 */
function legacySomeday(array $columns): array
{
    $tasks = [];

    foreach ($columns as $i => $column) {
        $task = test()->tasks->createTask(['text' => "S{$i}", 'date' => null]);
        Task::query()->whereKey($task['id'])->update(['someday_column' => $column]);
        $tasks[] = [...$task, 'someday_column' => $column];
    }

    return $tasks;
}

describe('task repository', function () {
    it('creates a task with defaults and a fresh version', function () {
        $versionBefore = (int) DB::table('sync_versions')->value('value');
        $task = $this->tasks->createTask(['text' => 'Buy milk', 'date' => REPO_DAY]);

        expect($task)->toMatchArray([
            'text' => 'Buy milk',
            'date' => REPO_DAY,
            'someday_column' => null,
            'done' => false,
            'done_at' => null,
            'color' => 'none',
            'time' => null,
            'notes' => '',
            'subtasks' => [],
            'deleted_at' => null,
        ])
            ->and($task['id'])->toMatch('/^[0-9a-f-]{36}$/')
            ->and($task['id'][14])->toBe('7')
            ->and($task['created_at'])->toBe($task['updated_at'])
            ->and(repoRow($task['id']))->toBe($task);

        $stored = Task::query()->findOrFail($task['id']);

        expect($stored->user_id)->toBe($this->user->id)
            ->and($stored->version)->toBeGreaterThan($versionBefore);
    });

    it('creates Someday tasks without a date', function () {
        expect($this->tasks->createTask(['text' => 'Read', 'date' => null]))->toMatchArray(['date' => null]);
    });

    it('bumps updated_at and the version on every mutation', function () {
        $task = $this->tasks->createTask(['text' => 'A', 'date' => REPO_DAY]);
        $version = Task::query()->findOrFail($task['id'])->version;
        $updated = $this->tasks->updateTask($task['id'], ['text' => 'B', 'color' => 'mango']);

        expect($updated->task['text'])->toBe('B')
            ->and($updated->task['color'])->toBe('mango')
            ->and($updated->task['updated_at'] > $task['updated_at'])->toBeTrue()
            ->and(Task::query()->findOrFail($task['id'])->version)->toBeGreaterThan($version);
    });

    it('toggles done and done_at', function () {
        $task = $this->tasks->createTask(['text' => 'A', 'date' => REPO_DAY]);
        $done = $this->tasks->toggleDone($task['id']);

        expect($done->task['done'])->toBeTrue()
            ->and($done->task['done_at'])->toBe($done->task['updated_at']);

        $undone = $this->tasks->toggleDone($task['id']);

        expect($undone->task['done'])->toBeFalse()
            ->and($undone->task['done_at'])->toBeNull();
    });

    it('deletes with a tombstone that is still synced', function () {
        $task = $this->tasks->createTask(['text' => 'A', 'date' => REPO_DAY]);
        $deleted = $this->tasks->deleteTask($task['id']);

        expect($deleted['deleted_at'])->toBe($deleted['updated_at'])
            ->and(repoRow($task['id'])['deleted_at'])->not->toBeNull()
            ->and(repoTexts(REPO_DAY))->toBe([])
            ->and(fn () => $this->tasks->updateTask($task['id'], ['text' => 'B']))->toThrow(TaskNotFound::class);
    });

    it('restores a deleted task with a newer change', function () {
        $task = $this->tasks->createTask(['text' => 'A', 'date' => REPO_DAY]);
        $deleted = $this->tasks->deleteTask($task['id']);
        $restored = $this->tasks->restoreTask($task['id']);

        expect($restored->task['deleted_at'])->toBeNull()
            ->and($restored->task['updated_at'] > $deleted['updated_at'])->toBeTrue()
            ->and(repoTexts(REPO_DAY))->toBe(['A']);
    });

    it('keeps every one of several subtask edits', function () {
        $task = $this->tasks->createTask(['text' => 'A', 'date' => REPO_DAY]);

        foreach (['one', 'two', 'three'] as $text) {
            $this->tasks->updateSubtasks($task['id'], fn (array $subtasks) => [...$subtasks, ['id' => $text, 'text' => $text, 'done' => false]]);
        }

        expect(array_column(repoRow($task['id'])['subtasks'], 'text'))->toBe(['one', 'two', 'three']);
    });

    it('keeps the fields of successive edits', function () {
        $task = $this->tasks->createTask(['text' => 'A', 'date' => REPO_DAY]);

        $this->tasks->updateTask($task['id'], ['text' => 'B']);
        $this->tasks->updateTask($task['id'], ['color' => 'green']);
        $this->tasks->toggleDone($task['id']);

        expect(repoRow($task['id']))->toMatchArray(['text' => 'B', 'color' => 'green', 'done' => true]);
    });

    it('toggles twice when asked twice', function () {
        $task = $this->tasks->createTask(['text' => 'A', 'date' => REPO_DAY]);

        $this->tasks->toggleDone($task['id']);
        $this->tasks->toggleDone($task['id']);

        expect(repoRow($task['id'])['done'])->toBeFalse();
    });

    it('does not resurrect a deleted task', function () {
        $task = $this->tasks->createTask(['text' => 'A', 'date' => REPO_DAY]);

        $this->tasks->deleteTask($task['id']);

        expect(fn () => $this->tasks->updateTask($task['id'], ['text' => 'B']))->toThrow(TaskNotFound::class)
            ->and(repoRow($task['id'])['deleted_at'])->not->toBeNull();
    });

    it('ignores unknown patch fields', function () {
        $task = $this->tasks->createTask(['text' => 'A', 'date' => REPO_DAY, 'color' => 'pink']);
        $updated = $this->tasks->updateTask($task['id'], ['date' => '2030-01-01', 'id' => 'x']);

        expect($updated->task)->toMatchArray(['id' => $task['id'], 'date' => REPO_DAY, 'color' => 'pink']);
    });

    it('duplicates a task right after the original with new ids', function () {
        $first = $this->tasks->createTask([
            'text' => 'A',
            'date' => REPO_DAY,
            'subtasks' => [['id' => 's1', 'text' => 'step', 'done' => true]],
        ]);
        $this->tasks->createTask(['text' => 'B', 'date' => REPO_DAY]);

        $copy = $this->tasks->duplicateTask($first['id']);

        expect($copy['id'])->not->toBe($first['id'])
            ->and($copy['subtasks'][0]['id'])->not->toBe('s1')
            ->and($copy['subtasks'][0])->toMatchArray(['text' => 'step', 'done' => true])
            ->and(repoTexts(REPO_DAY))->toBe(['A', 'A', 'B'])
            ->and(Task::query()->find($copy['id']))->not->toBeNull();
    });
});

describe('server writes', function () {
    it('takes updated_at from the clock, or 1 ms after the stored one when that is later', function () {
        CarbonImmutable::setTestNow('2026-10-12T09:00:00.000Z');
        $task = $this->tasks->createTask(['text' => 'A', 'date' => REPO_DAY]);

        expect($task['created_at'])->toBe('2026-10-12T09:00:00.000Z')
            ->and($task['updated_at'])->toBe('2026-10-12T09:00:00.000Z');

        // Another device wrote it with a clock ahead of the server's.
        Task::query()->whereKey($task['id'])->update(['updated_at' => '2026-10-12 10:00:00.000']);

        expect($this->tasks->updateTask($task['id'], ['text' => 'B'])->task['updated_at'])->toBe('2026-10-12T10:00:00.001Z');

        CarbonImmutable::setTestNow('2026-10-12T11:00:00.000Z');

        expect($this->tasks->updateTask($task['id'], ['text' => 'C'])->task['updated_at'])->toBe('2026-10-12T11:00:00.000Z');
    });

    it('only touches the user’s own tasks', function () {
        $theirs = TaskRepository::for(User::factory()->create())->createTask(['text' => 'Theirs', 'date' => REPO_DAY]);

        expect(fn () => $this->tasks->updateTask($theirs['id'], ['text' => 'Mine']))->toThrow(TaskNotFound::class)
            ->and(fn () => $this->tasks->restoreTask($theirs['id']))->toThrow(TaskNotFound::class)
            ->and(repoTexts(REPO_DAY))->toBe([])
            ->and(repoRow($theirs['id'])['text'])->toBe('Theirs');
    });

    it('refuses rows the push would refuse, and writes nothing', function () {
        $task = $this->tasks->createTask(['text' => 'A', 'date' => REPO_DAY]);

        expect(fn () => $this->tasks->updateTask($task['id'], ['time' => '25:00']))->toThrow(InvalidTaskChange::class)
            ->and(fn () => $this->tasks->updateTask($task['id'], ['color' => 'red']))->toThrow(InvalidTaskChange::class)
            ->and(fn () => $this->tasks->createTask(['text' => 'B', 'date' => '2026-02-30']))->toThrow(InvalidTaskChange::class)
            ->and(repoRow($task['id']))->toBe($task)
            ->and(repoTexts(REPO_DAY))->toBe(['A']);
    });

    it('names the field a refused row breaks', function () {
        $task = $this->tasks->createTask(['text' => 'A', 'date' => REPO_DAY]);

        expect(fn () => $this->tasks->updateTask($task['id'], ['time' => '25:00']))
            ->toThrow(InvalidTaskChange::class, 'The time field must match the format H:i.');
    });

    it('refuses to place a task next to a malformed position as a domain error', function () {
        Task::factory()->for($this->user)->create(['date' => REPO_DAY, 'position' => 'a00']);

        expect(fn () => $this->tasks->createTask(['text' => 'A', 'date' => REPO_DAY]))->toThrow(InvalidTaskChange::class)
            ->and(Task::query()->count())->toBe(1);
    });

    it('never takes an impossible date in an occurrence id for another day', function () {
        $series = $this->tasks->createTask(['text' => 'Gym', 'date' => REPO_DAY]);
        $this->tasks->setRecurrence($series['id'], ['type' => 'daily', 'every' => 1]);

        expect($this->tasks->findTask("{$series['id']}:2026-02-31"))->toBeNull()
            ->and(fn () => $this->tasks->deleteTask("{$series['id']}:2026-10-32", Scope::Future))->toThrow(TaskNotFound::class)
            ->and(repoRow($series['id'])['recurrence'])->toBe(['type' => 'daily', 'every' => 1]);
    });

    it('creates a batch in one go, keeping its order', function () {
        $this->tasks->createTask(['text' => 'Existing', 'date' => REPO_DAY]);

        $created = $this->tasks->createTasks([
            ['text' => 'One', 'date' => REPO_DAY],
            ['text' => 'Two', 'date' => REPO_DAY],
            ['text' => 'Idea', 'date' => null],
            ['text' => 'Three', 'date' => REPO_DAY],
        ]);

        expect($created)->toHaveCount(4)
            ->and(repoTexts(REPO_DAY))->toBe(['Existing', 'One', 'Two', 'Three'])
            ->and(repoTexts(null))->toBe(['Idea']);
    });

    it('places a batch task next to one created earlier in the same batch', function () {
        $a = $this->tasks->createTask(['text' => 'A', 'date' => REPO_DAY]);

        $this->tasks->createTasks([
            ['text' => 'First', 'date' => REPO_DAY, 'before_id' => $a['id']],
            ['text' => 'Last', 'date' => REPO_DAY],
        ]);

        expect(repoTexts(REPO_DAY))->toBe(['First', 'A', 'Last']);
    });
});

describe('positions', function () {
    it('appends new tasks at the end of their day', function () {
        $this->tasks->createTask(['text' => 'A', 'date' => REPO_DAY]);
        $this->tasks->createTask(['text' => 'B', 'date' => REPO_DAY]);
        $this->tasks->createTask(['text' => 'C', 'date' => REPO_DAY]);
        $this->tasks->createTask(['text' => 'X', 'date' => REPO_OTHER_DAY]);

        expect(repoTexts(REPO_DAY))->toBe(['A', 'B', 'C']);
    });

    it('inserts between neighbours', function () {
        $a = $this->tasks->createTask(['text' => 'A', 'date' => REPO_DAY]);
        $b = $this->tasks->createTask(['text' => 'B', 'date' => REPO_DAY]);

        $this->tasks->createTask(['text' => 'between', 'date' => REPO_DAY, 'after_id' => $a['id'], 'before_id' => $b['id']]);
        $this->tasks->createTask(['text' => 'first', 'date' => REPO_DAY, 'before_id' => $a['id']]);

        expect(repoTexts(REPO_DAY))->toBe(['first', 'A', 'between', 'B']);
    });

    it('moves a task within a day', function () {
        $a = $this->tasks->createTask(['text' => 'A', 'date' => REPO_DAY]);
        $b = $this->tasks->createTask(['text' => 'B', 'date' => REPO_DAY]);
        $c = $this->tasks->createTask(['text' => 'C', 'date' => REPO_DAY]);

        $this->tasks->moveTask($c['id'], REPO_DAY, beforeId: $a['id']);
        expect(repoTexts(REPO_DAY))->toBe(['C', 'A', 'B']);

        $this->tasks->moveTask($c['id'], REPO_DAY, afterId: $a['id']);
        expect(repoTexts(REPO_DAY))->toBe(['A', 'C', 'B']);

        $this->tasks->moveTask($a['id'], REPO_DAY, beforeId: $b['id'], afterId: $c['id']);
        expect(repoTexts(REPO_DAY))->toBe(['C', 'A', 'B']);

        $this->tasks->moveTask($c['id'], REPO_DAY);
        expect(repoTexts(REPO_DAY))->toBe(['A', 'B', 'C']);
    });

    it('ignores a neighbour that is not in the target list', function () {
        $a = $this->tasks->createTask(['text' => 'A', 'date' => REPO_DAY]);
        $elsewhere = $this->tasks->createTask(['text' => 'Elsewhere', 'date' => REPO_OTHER_DAY]);

        $this->tasks->createTask(['text' => 'B', 'date' => REPO_DAY, 'before_id' => $elsewhere['id']]);
        $this->tasks->moveTask($a['id'], REPO_DAY, beforeId: 'missing');

        expect(repoTexts(REPO_DAY))->toBe(['B', 'A']);
    });

    it('moves a task between a day and Someday', function () {
        $a = $this->tasks->createTask(['text' => 'A', 'date' => REPO_DAY]);
        $s = $this->tasks->createTask(['text' => 'S', 'date' => null]);

        $moved = $this->tasks->moveTask($a['id'], null, beforeId: $s['id']);

        expect($moved->task)->toMatchArray(['date' => null])
            ->and(repoTexts(REPO_DAY))->toBe([])
            ->and(repoTexts(null))->toBe(['A', 'S']);

        $back = $this->tasks->moveTask($a['id'], REPO_OTHER_DAY);

        expect($back->task)->toMatchArray(['date' => REPO_OTHER_DAY, 'someday_column' => null])
            ->and(repoTexts(null))->toBe(['S']);
    });

    describe('the Someday list', function () {
        it('creates the first task in column 0', function () {
            expect($this->tasks->createTask(['text' => 'A', 'date' => null])['someday_column'])->toBe(0);
        });

        it('appends a new task after the last one, in its column', function () {
            [, , $last] = legacySomeday([0, 1, 2]);
            $task = $this->tasks->createTask(['text' => 'new', 'date' => null]);

            expect($task['someday_column'])->toBe($last['someday_column'])
                ->and(repoTexts(null))->toBe(['S0', 'S1', 'S2', 'new']);
        });

        it('moves between neighbours in different columns', function () {
            [$s0, $s1, $s2] = legacySomeday([0, 1, 1]);
            $a = $this->tasks->createTask(['text' => 'A', 'date' => REPO_DAY]);

            $this->tasks->moveTask($a['id'], null, beforeId: $s1['id'], afterId: $s0['id']);
            expect(repoTexts(null))->toBe(['S0', 'A', 'S1', 'S2'])
                ->and(repoRow($a['id'])['someday_column'])->toBe(0);

            $this->tasks->moveTask($a['id'], null, beforeId: $s2['id'], afterId: $s1['id']);
            expect(repoTexts(null))->toBe(['S0', 'S1', 'A', 'S2'])
                ->and(repoRow($a['id'])['someday_column'])->toBe(1);

            $this->tasks->moveTask($a['id'], null, beforeId: $s0['id']);
            expect(repoTexts(null))->toBe(['A', 'S0', 'S1', 'S2'])
                ->and(repoRow($a['id'])['someday_column'])->toBe(0);
        });

        it('only writes the task that moves', function () {
            $tasks = legacySomeday([0, 2]);
            $before = repoRow($tasks[0]['id']);

            $this->tasks->moveTask($tasks[1]['id'], null, beforeId: $tasks[0]['id']);

            expect(repoTexts(null))->toBe(['S1', 'S0'])
                ->and(repoRow($tasks[0]['id']))->toBe($before);
        });

        it('duplicates a task right after it', function () {
            [$s0, $s1] = legacySomeday([0, 1]);
            $copy = $this->tasks->duplicateTask($s0['id']);
            $list = $this->tasks->listTasksIn(null);

            expect($copy['someday_column'])->toBe(0)
                ->and(repoTexts(null))->toBe(['S0', 'S0', 'S1'])
                ->and(end($list)->id())->toBe($s1['id']);
        });
    });

    it('breaks position ties by id', function () {
        Task::factory()->for($this->user)->create(['id' => 'b', 'text' => 'second', 'date' => REPO_DAY, 'position' => 'a0']);
        Task::factory()->for($this->user)->create(['id' => 'a', 'text' => 'first', 'date' => REPO_DAY, 'position' => 'a0']);

        expect(repoTexts(REPO_DAY))->toBe(['first', 'second']);
    });
});

describe('carryOverTasks', function () {
    $today = '2026-10-15';
    $yesterday = '2026-10-14';
    $lastWeek = '2026-10-08';
    $tomorrow = '2026-10-16';

    it('moves unfinished past tasks after today’s, oldest day first', function () use ($today, $yesterday, $lastWeek) {
        $this->tasks->createTask(['text' => 'Today', 'date' => $today]);
        $this->tasks->createTask(['text' => 'Yesterday A', 'date' => $yesterday]);
        $this->tasks->createTask(['text' => 'Yesterday B', 'date' => $yesterday]);
        $this->tasks->createTask(['text' => 'Last week', 'date' => $lastWeek]);

        expect($this->tasks->carryOverTasks($today))->toBe(3)
            ->and(repoTexts($today))->toBe(['Today', 'Last week', 'Yesterday A', 'Yesterday B'])
            ->and(repoTexts($yesterday))->toBe([])
            ->and(repoTexts($lastWeek))->toBe([]);
    });

    it('leaves today, future, done, deleted and Someday tasks alone', function () use ($today, $yesterday, $tomorrow) {
        $this->tasks->createTask(['text' => 'Today', 'date' => $today]);
        $this->tasks->createTask(['text' => 'Tomorrow', 'date' => $tomorrow]);
        $done = $this->tasks->createTask(['text' => 'Done', 'date' => $yesterday]);
        $deleted = $this->tasks->createTask(['text' => 'Deleted', 'date' => $yesterday]);
        $this->tasks->createTask(['text' => 'Idea', 'date' => null]);

        $this->tasks->toggleDone($done['id']);
        $this->tasks->deleteTask($deleted['id']);

        expect($this->tasks->carryOverTasks($today))->toBe(0)
            ->and(repoTexts($today))->toBe(['Today'])
            ->and(repoTexts($tomorrow))->toBe(['Tomorrow'])
            ->and(repoTexts($yesterday))->toBe(['Done'])
            ->and(repoRow($deleted['id'])['date'])->toBe($yesterday)
            ->and($this->tasks->listTasksIn(null))->toHaveCount(1);
    });

    it('never carries recurring tasks: series, occurrences or exceptions', function () use ($today, $yesterday, $lastWeek) {
        $series = $this->tasks->createTask(['text' => 'Gym', 'date' => $lastWeek]);

        // A daily series from last week, with one edited (exception) occurrence.
        $this->tasks->setRecurrence($series['id'], ['type' => 'daily', 'every' => 1]);
        $this->tasks->updateTask("{$series['id']}:{$yesterday}", ['text' => 'Gym (late)']);

        expect($this->tasks->carryOverTasks($today))->toBe(0)
            ->and(repoTexts($yesterday))->toBe(['Gym (late)'])
            ->and(repoTexts($today))->toBe(['Gym'])
            ->and(Task::query()->count())->toBe(2);
    });

    it('is idempotent', function () use ($today, $yesterday) {
        $this->tasks->createTask(['text' => 'Late', 'date' => $yesterday]);

        expect($this->tasks->carryOverTasks($today))->toBe(1);

        $moved = $this->tasks->listTasksIn($today);

        expect($this->tasks->carryOverTasks($today))->toBe(0)
            ->and($this->tasks->listTasksIn($today))->toEqual($moved);
    });

    it('keeps the subtasks and syncs the move', function () use ($today, $yesterday) {
        $task = $this->tasks->createTask([
            'text' => 'Late',
            'date' => $yesterday,
            'subtasks' => [['id' => 's1', 'text' => 'Step', 'done' => true]],
        ]);
        $version = Task::query()->findOrFail($task['id'])->version;

        $this->tasks->carryOverTasks($today);

        $row = Task::query()->findOrFail($task['id']);

        expect($row->date)->toBe($today)
            ->and($row->subtasks)->toBe($task['subtasks'])
            ->and($row->toRecord()['updated_at'] > $task['updated_at'])->toBeTrue()
            ->and($row->version)->toBeGreaterThan($version);
    });

    it('refuses a date that is not a calendar day', function () {
        expect(fn () => $this->tasks->carryOverTasks('2026-13-01'))->toThrow(InvalidTaskChange::class);
    });
});
