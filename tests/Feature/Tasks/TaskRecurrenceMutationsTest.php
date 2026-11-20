<?php

use App\Models\Task;
use App\Models\User;
use App\Tasks\InvalidTaskChange;
use App\Tasks\ItemKind;
use App\Tasks\Occurrence;
use App\Tasks\PlannerItem;
use App\Tasks\Scope;
use App\Tasks\TaskOccurrences;
use App\Tasks\TaskRepository;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;

// The cases mirror resources/js/lib/db/recurrence.test.ts (all but undo, which only the client has), so recurring
// tasks change on the server exactly like in the planner.

uses(RefreshDatabase::class);

const MON = '2026-10-12';
const TUE = '2026-10-13';
const WED = '2026-10-14';
const FRI = '2026-10-16';
const NEXT_MON = '2026-10-19';
const NEXT_WED = '2026-10-21';
const NEXT_FRI = '2026-10-23';
const MON_WED_FRI = ['type' => 'weekly', 'weekdays' => [1, 3, 5]];

beforeEach(function () {
    $this->user = User::factory()->create();
    $this->tasks = TaskRepository::for($this->user);
});

/**
 * A Mon/Wed/Fri series starting on MON; returns its row.
 *
 * @param  array<string, mixed>  $recurrence
 * @return array<string, mixed>
 */
function gym(array $recurrence = MON_WED_FRI): array
{
    $task = test()->tasks->createTask(['text' => 'Gym', 'date' => MON, 'color' => 'green']);

    test()->tasks->setRecurrence($task['id'], $recurrence);

    return recRow($task['id']);
}

function occ(string $seriesId, string $date): string
{
    return Occurrence::idFor($seriesId, $date);
}

/**
 * @return array<string, mixed>
 */
function recRow(string $id): array
{
    return Task::query()->findOrFail($id)->toRecord();
}

/**
 * @return list<array<string, mixed>>
 */
function recRows(): array
{
    return Task::query()->get()->map(fn (Task $task) => $task->toRecord())->all();
}

/**
 * 'text@date' of what the planner shows over `$from`–`$to` (two weeks from MON by default), in display order.
 *
 * @return list<string>
 */
function shown(string $from = MON, string $to = '2026-10-25'): array
{
    return app(TaskOccurrences::class)
        ->forUser(test()->user, CarbonImmutable::parse($from), CarbonImmutable::parse($to))
        ->map(fn (Occurrence $item) => $item->text.($item->done ? '✓' : '')."@{$item->date}")
        ->all();
}

/**
 * @return list<string>
 */
function dayKinds(?string $date): array
{
    return array_map(fn (PlannerItem $item) => $item->kind->value, test()->tasks->listTasksIn($date));
}

describe('making a task recurring', function () {
    it('turns a plain task into a series anchored at its date', function () {
        $task = $this->tasks->createTask(['text' => 'Gym', 'date' => MON]);
        $result = $this->tasks->setRecurrence($task['id'], MON_WED_FRI);

        expect($result->kind)->toBe(ItemKind::Occurrence)
            ->and($result->id())->toBe(occ($task['id'], MON))
            ->and(recRow($task['id']))->toMatchArray([
                'date' => MON,
                'recurrence' => MON_WED_FRI,
                'series_id' => null,
                'occurrence_date' => null,
            ])
            ->and(shown())->toBe(['Gym@'.MON, 'Gym@'.WED, 'Gym@'.FRI, 'Gym@'.NEXT_MON, 'Gym@'.NEXT_WED, 'Gym@'.NEXT_FRI]);
    });

    it('returns the series when its own date does not repeat', function () {
        $task = $this->tasks->createTask(['text' => 'Gym', 'date' => TUE]);
        $result = $this->tasks->setRecurrence($task['id'], MON_WED_FRI);

        expect($result->kind)->toBe(ItemKind::Series)
            ->and($result->id())->toBe($task['id'])
            ->and($this->tasks->listTasksIn(TUE))->toBe([]);
    });

    it('refuses a Someday task', function () {
        $task = $this->tasks->createTask(['text' => 'Read', 'date' => null]);

        expect(fn () => $this->tasks->setRecurrence($task['id'], MON_WED_FRI))->toThrow(InvalidTaskChange::class);
    });

    it('does nothing when removing recurrence from a plain task', function () {
        $task = $this->tasks->createTask(['text' => 'A', 'date' => MON]);

        $this->tasks->setRecurrence($task['id'], null);

        expect(recRow($task['id']))->toBe($task);
    });

    it('keeps Someday free of occurrences', function () {
        gym();

        expect($this->tasks->listTasksIn(null))->toBe([]);
    });

    it('sorts occurrences with the day: timed first, then by position', function () {
        gym();

        $this->tasks->createTask(['text' => 'Before', 'date' => MON]);
        $this->tasks->createTask(['text' => 'Timed', 'date' => MON, 'time' => '09:00']);

        expect(shown(MON, MON))->toBe(['Timed@'.MON, 'Gym@'.MON, 'Before@'.MON]);
    });
});

describe('reading occurrences', function () {
    it('resolves an occurrence id, and then its exception', function () {
        $series = gym();
        $id = occ($series['id'], WED);

        expect($this->tasks->findTask($id))->toMatchObject(['kind' => ItemKind::Occurrence])
            ->and($this->tasks->findTask($id)?->task)->toMatchArray(['id' => $id, 'date' => WED])
            ->and($this->tasks->findTask(occ($series['id'], TUE)))->toBeNull()
            ->and($this->tasks->findTask(occ('missing', WED)))->toBeNull();

        $exception = $this->tasks->toggleDone($id);
        $found = $this->tasks->findTask($id);

        expect($found?->kind)->toBe(ItemKind::Exception)
            ->and($found?->id())->toBe($exception->id())
            ->and($found?->task['done'])->toBeTrue();
    });

    it('finds the series of an item', function () {
        $series = gym();
        $plain = $this->tasks->createTask(['text' => 'A', 'date' => MON]);

        expect($this->tasks->findTask(occ($series['id'], WED))?->seriesId())->toBe($series['id'])
            ->and($this->tasks->findTask($plain['id'])?->seriesId())->toBeNull();
    });
});

describe('changing one occurrence', function () {
    it('toggles done by writing an exception', function () {
        $series = gym();
        $id = occ($series['id'], WED);
        $exception = $this->tasks->toggleDone($id);

        expect($exception->kind)->toBe(ItemKind::Exception)
            ->and($exception->seriesId())->toBe($series['id'])
            ->and($exception->occurrenceDate())->toBe(WED)
            ->and($exception->task)->toMatchArray([
                'series_id' => $series['id'],
                'occurrence_date' => WED,
                'recurrence' => null,
                'date' => WED,
                'done' => true,
                'color' => 'green',
            ])
            ->and($exception->id())->not->toBe($id)
            ->and($exception->id()[14])->toBe('7')
            ->and(shown())->toContain('Gym✓@'.WED);

        $this->tasks->toggleDone($id);

        expect(recRow($exception->id())['done'])->toBeFalse()
            ->and(Task::query()->count())->toBe(2);
    });

    it('edits only this one', function () {
        $series = gym();
        $edited = $this->tasks->updateTask(occ($series['id'], WED), ['text' => 'Yoga']);

        expect($edited->kind)->toBe(ItemKind::Exception)
            ->and(shown())->toBe(['Gym@'.MON, 'Yoga@'.WED, 'Gym@'.FRI, 'Gym@'.NEXT_MON, 'Gym@'.NEXT_WED, 'Gym@'.NEXT_FRI]);
    });

    it('edits subtasks of an occurrence', function () {
        $series = gym();

        $this->tasks->updateTask($series['id'], ['subtasks' => [['id' => 's1', 'text' => 'Stretch', 'done' => false]]]);

        $edited = $this->tasks->updateSubtasks(
            occ($series['id'], WED),
            fn (array $subtasks) => array_map(fn (array $subtask) => [...$subtask, 'done' => true], $subtasks),
        );

        expect($edited->task['subtasks'])->toBe([['id' => 's1', 'text' => 'Stretch', 'done' => true]])
            ->and(recRow($series['id'])['subtasks'][0]['done'])->toBeFalse();
    });

    it('moves an occurrence to another day or Someday', function () {
        $series = gym();
        $moved = $this->tasks->moveTask(occ($series['id'], WED), TUE);

        expect($moved->kind)->toBe(ItemKind::Exception)
            ->and($moved->task['date'])->toBe(TUE)
            ->and($moved->occurrenceDate())->toBe(WED)
            ->and(array_slice(shown(), 0, 3))->toBe(['Gym@'.MON, 'Gym@'.TUE, 'Gym@'.FRI]);

        $this->tasks->moveTask(occ($series['id'], FRI), null);

        expect(dayKinds(null))->toBe(['exception'])
            // Only that date leaves the week; the series still expands.
            ->and(shown())->toBe(['Gym@'.MON, 'Gym@'.TUE, 'Gym@'.NEXT_MON, 'Gym@'.NEXT_WED, 'Gym@'.NEXT_FRI]);
    });

    it('reorders around occurrences of the target day', function () {
        $series = gym();
        $plain = $this->tasks->createTask(['text' => 'Plain', 'date' => MON]);

        $this->tasks->moveTask($plain['id'], MON, beforeId: occ($series['id'], MON));

        expect(array_map(fn (PlannerItem $item) => $item->task['text'], $this->tasks->listTasksIn(MON)))->toBe(['Plain', 'Gym']);

        $this->tasks->moveTask(occ($series['id'], MON), MON, beforeId: $plain['id']);

        expect(array_map(fn (PlannerItem $item) => $item->task['text'], $this->tasks->listTasksIn(MON)))->toBe(['Gym', 'Plain']);
    });

    it('deletes only this one, and restores it', function () {
        $series = gym();
        $id = occ($series['id'], WED);
        $tombstone = $this->tasks->deleteTask($id);

        expect($tombstone)->toMatchArray(['series_id' => $series['id'], 'occurrence_date' => WED])
            ->and($tombstone['deleted_at'])->not->toBeNull()
            ->and($this->tasks->findTask($id))->toBeNull()
            ->and(shown())->not->toContain('Gym@'.WED);

        $this->tasks->restoreTask($id);

        expect(shown())->toContain('Gym@'.WED);
    });

    it('duplicates an occurrence as a plain task', function () {
        $series = gym();
        $copy = $this->tasks->duplicateTask(occ($series['id'], WED));

        expect($copy)->toMatchArray([
            'text' => 'Gym',
            'date' => WED,
            'recurrence' => null,
            'series_id' => null,
            'occurrence_date' => null,
        ])
            ->and(dayKinds(WED))->toBe(['exception', 'task']);
    });

    it('gives an occurrence its exception row unchanged', function () {
        $series = gym();
        $before = shown();
        $row = $this->tasks->materializeOccurrence(occ($series['id'], WED));

        expect($row->kind)->toBe(ItemKind::Exception)
            ->and($row->task)->toMatchArray(['text' => 'Gym', 'date' => WED, 'done' => false, 'color' => 'green'])
            ->and($this->tasks->materializeOccurrence(occ($series['id'], WED))->id())->toBe($row->id())
            ->and(Task::query()->count())->toBe(2)
            ->and(shown())->toBe($before);
    });
});

describe('duplicate exceptions from sync', function () {
    it('lists and resolves only the winner, and edits it', function () {
        $series = gym();
        $id = occ($series['id'], WED);
        $mine = $this->tasks->toggleDone($id);
        // Another device changed the same occurrence offline, later.
        $theirs = Task::factory()->for($this->user)->create([
            ...recRow($mine->id()),
            'id' => 'ffffffff-0000-7000-8000-000000000000',
            'text' => 'Theirs',
            'date' => TUE,
            'done' => false,
            'done_at' => null,
            'updated_at' => CarbonImmutable::parse($mine->task['updated_at'])->addSecond(),
        ]);

        expect(array_slice(shown(), 0, 4))->toBe(['Gym@'.MON, 'Theirs@'.TUE, 'Gym@'.FRI, 'Gym@'.NEXT_MON])
            ->and($this->tasks->findTask($id)?->id())->toBe($theirs->id)
            ->and($this->tasks->findTask($mine->id()))->toBeNull();

        $this->tasks->updateTask($id, ['text' => 'Edited']);

        expect(recRow($theirs->id)['text'])->toBe('Edited')
            ->and(Task::query()->where('series_id', $series['id'])->count())->toBe(2);
    });

    it('hides the occurrence when the winning duplicate is deleted', function () {
        $series = gym();
        $mine = $this->tasks->toggleDone(occ($series['id'], WED));
        $later = CarbonImmutable::parse($mine->task['updated_at'])->addSecond();

        Task::factory()->for($this->user)->create([
            ...recRow($mine->id()),
            'id' => 'ffffffff-0000-7000-8000-000000000000',
            'updated_at' => $later,
            'deleted_at' => $later,
        ]);

        expect($this->tasks->findTask(occ($series['id'], WED)))->toBeNull()
            ->and($this->tasks->listTasksIn(WED))->toBe([]);
    });
});

describe('this and all future', function () {
    it('splits the series when editing from an occurrence', function () {
        $series = gym();

        $this->tasks->toggleDone(occ($series['id'], NEXT_MON));

        $result = $this->tasks->updateTask(occ($series['id'], FRI), ['text' => 'Yoga', 'done' => true], Scope::Future);

        expect(shown())->toBe(['Gym@'.MON, 'Gym@'.WED, 'Yoga@'.FRI, 'Yoga@'.NEXT_MON, 'Yoga@'.NEXT_WED, 'Yoga@'.NEXT_FRI])
            ->and(recRow($series['id'])['recurrence'])->toBe([...MON_WED_FRI, 'until' => '2026-10-15']);

        $all = recRows();
        $successor = collect($all)->first(fn (array $row) => $row['recurrence'] !== null && $row['id'] !== $series['id']);

        expect($successor)->toMatchArray([
            'date' => FRI,
            'text' => 'Yoga',
            'done' => false,
            'color' => 'green',
            'recurrence' => MON_WED_FRI,
        ])
            ->and($result->kind)->toBe(ItemKind::Occurrence)
            ->and($result->id())->toBe(occ($successor['id'], FRI));

        // The exception after the split date was deleted with the old part.
        $old = array_values(array_filter($all, fn (array $row) => $row['series_id'] === $series['id']));

        expect($old)->toHaveCount(1)
            ->and($old[0]['occurrence_date'])->toBe(NEXT_MON)
            ->and($old[0]['deleted_at'])->not->toBeNull();
    });

    it('keeps the until of the series it splits', function () {
        $series = gym([...MON_WED_FRI, 'until' => NEXT_WED]);

        $this->tasks->updateTask(occ($series['id'], FRI), ['text' => 'Yoga'], Scope::Future);

        expect(shown())->toBe(['Gym@'.MON, 'Gym@'.WED, 'Yoga@'.FRI, 'Yoga@'.NEXT_MON, 'Yoga@'.NEXT_WED]);
    });

    it('edits the series in place from its first occurrence', function () {
        $series = gym();
        $id = occ($series['id'], MON);
        $result = $this->tasks->updateTask($id, ['text' => 'Yoga'], Scope::Future);

        expect($result->id())->toBe($id)
            ->and(Task::query()->count())->toBe(1)
            ->and(recRow($series['id']))->toMatchArray(['text' => 'Yoga', 'recurrence' => MON_WED_FRI])
            ->and(shown())->toBe(['Yoga@'.MON, 'Yoga@'.WED, 'Yoga@'.FRI, 'Yoga@'.NEXT_MON, 'Yoga@'.NEXT_WED, 'Yoga@'.NEXT_FRI]);
    });

    it('keeps the earlier edits of an exception in the new series', function () {
        $series = gym();
        $renamed = $this->tasks->updateTask(occ($series['id'], FRI), ['text' => 'Yoga']);

        $this->tasks->updateTask($renamed->id(), ['color' => 'pink'], Scope::Future);

        $successor = collect(recRows())->first(fn (array $row) => $row['recurrence'] !== null && $row['id'] !== $series['id']);

        expect($successor)->toMatchArray(['text' => 'Yoga', 'color' => 'pink']);
    });

    it('refuses invalid rules before writing', function () {
        $task = $this->tasks->createTask(['text' => 'A', 'date' => MON]);

        expect(fn () => $this->tasks->setRecurrence($task['id'], ['type' => 'weekly', 'weekdays' => []]))->toThrow(InvalidTaskChange::class)
            ->and(fn () => $this->tasks->setRecurrence($task['id'], ['type' => 'daily', 'every' => 366]))->toThrow(InvalidTaskChange::class)
            ->and(fn () => $this->tasks->setRecurrence($task['id'], ['type' => 'monthly', 'day' => 32]))->toThrow(InvalidTaskChange::class)
            ->and(fn () => $this->tasks->setRecurrence($task['id'], ['type' => 'yearly']))->toThrow(InvalidTaskChange::class)
            ->and(fn () => $this->tasks->setRecurrence($task['id'], [...MON_WED_FRI, 'until' => '2026-10-11']))->toThrow(InvalidTaskChange::class)
            ->and(recRow($task['id'])['recurrence'])->toBeNull();

        $this->tasks->setRecurrence($task['id'], ['type' => 'weekly', 'weekdays' => [3, 1, 1]]);

        expect(recRow($task['id'])['recurrence'])->toBe(['type' => 'weekly', 'weekdays' => [1, 3]]);
    });

    it('splits from an exception at its original date', function () {
        $series = gym();
        $moved = $this->tasks->moveTask(occ($series['id'], WED), TUE);

        $this->tasks->updateTask($moved->id(), ['text' => 'Yoga'], Scope::Future);

        expect(array_slice(shown(), 0, 3))->toBe(['Gym@'.MON, 'Yoga@'.WED, 'Yoga@'.FRI])
            ->and(recRow($moved->id())['deleted_at'])->not->toBeNull();
    });

    it('deletes this and all future', function () {
        $series = gym();

        $this->tasks->toggleDone(occ($series['id'], NEXT_WED));
        $this->tasks->deleteTask(occ($series['id'], FRI), Scope::Future);

        expect(shown())->toBe(['Gym@'.MON, 'Gym@'.WED])
            ->and(recRow($series['id'])['recurrence']['until'])->toBe('2026-10-15');
    });

    it('deletes the whole series from its first occurrence', function () {
        $series = gym();

        $this->tasks->toggleDone(occ($series['id'], WED));
        $this->tasks->deleteTask(occ($series['id'], MON), Scope::Future);

        expect(shown())->toBe([])
            ->and(collect(recRows())->every(fn (array $row) => $row['deleted_at'] !== null))->toBeTrue();
    });

    it('changes the rule from an occurrence on', function () {
        $series = gym();
        $result = $this->tasks->setRecurrence(occ($series['id'], FRI), ['type' => 'weekly', 'weekdays' => [5]]);

        expect(shown())->toBe(['Gym@'.MON, 'Gym@'.WED, 'Gym@'.FRI, 'Gym@'.NEXT_FRI])
            ->and($result->kind)->toBe(ItemKind::Occurrence)
            ->and($result->task['date'])->toBe(FRI);
    });

    it('changes the rule in place from the first occurrence', function () {
        $series = gym();

        $this->tasks->setRecurrence(occ($series['id'], MON), ['type' => 'weekly', 'weekdays' => [1]]);

        expect(Task::query()->count())->toBe(1)
            ->and(shown())->toBe(['Gym@'.MON, 'Gym@'.NEXT_MON]);
    });

    it('gives only one occurrence a new rule, as a series of its own', function () {
        $series = gym(['type' => 'weekly', 'weekdays' => [1]]);
        $result = $this->tasks->setRecurrence(occ($series['id'], NEXT_MON), MON_WED_FRI, Scope::This);

        expect($result->kind)->toBe(ItemKind::Occurrence)
            ->and($result->task['date'])->toBe(NEXT_MON)
            ->and($result->id())->not->toContain($series['id'])
            // The old series keeps its rule and only loses this date.
            ->and(recRow($series['id'])['recurrence'])->toBe(['type' => 'weekly', 'weekdays' => [1]])
            ->and(shown())->toBe(['Gym@'.MON, 'Gym@'.NEXT_MON, 'Gym@'.NEXT_WED, 'Gym@'.NEXT_FRI])
            ->and($this->tasks->findTask(occ($series['id'], NEXT_MON)))->toBeNull()
            ->and($this->tasks->listTasksIn('2026-10-26'))->toHaveCount(2);
    });

    it('gives an exception a new rule with scope this, keeping its edits', function () {
        $series = gym();
        $renamed = $this->tasks->updateTask(occ($series['id'], WED), ['text' => 'Swim']);
        $result = $this->tasks->setRecurrence($renamed->id(), ['type' => 'weekly', 'weekdays' => [3]], Scope::This);

        expect($result->kind)->toBe(ItemKind::Occurrence)
            ->and($result->task['text'])->toBe('Swim')
            ->and(shown())->toBe([
                'Gym@'.MON, 'Swim@'.WED, 'Gym@'.FRI, 'Gym@'.NEXT_MON, 'Gym@'.NEXT_WED, 'Swim@'.NEXT_WED, 'Gym@'.NEXT_FRI,
            ])
            ->and(recRow($renamed->id())['deleted_at'])->not->toBeNull();
    });

    it('changes the rule in place from the first match of a later anchor', function () {
        // Anchored on a Tuesday, the series first occurs on Wednesday.
        $task = $this->tasks->createTask(['text' => 'Gym', 'date' => TUE]);

        $this->tasks->setRecurrence($task['id'], ['type' => 'weekly', 'weekdays' => [3]]);
        $this->tasks->setRecurrence(occ($task['id'], WED), MON_WED_FRI);

        expect(Task::query()->count())->toBe(1)
            ->and(shown())->toBe(['Gym@'.WED, 'Gym@'.FRI, 'Gym@'.NEXT_MON, 'Gym@'.NEXT_WED, 'Gym@'.NEXT_FRI]);
    });

    it('stops repeating from an occurrence on, which becomes plain', function () {
        $series = gym();
        $result = $this->tasks->setRecurrence(occ($series['id'], WED), null);

        expect($result->kind)->toBe(ItemKind::Task)
            ->and($result->task)->toMatchArray(['date' => WED, 'series_id' => null, 'occurrence_date' => null, 'recurrence' => null])
            ->and(shown())->toBe(['Gym@'.MON, 'Gym@'.WED])
            ->and(recRow($series['id'])['recurrence']['until'])->toBe(TUE);
    });

    it('turns an exception into the plain task when repeating stops', function () {
        $series = gym();
        $done = $this->tasks->toggleDone(occ($series['id'], WED));
        $result = $this->tasks->setRecurrence($done->id(), null);

        expect($result->kind)->toBe(ItemKind::Task)
            ->and($result->id())->toBe($done->id())
            ->and($result->task['done'])->toBeTrue()
            ->and(shown())->toBe(['Gym@'.MON, 'Gym✓@'.WED]);
    });

    it('takes one occurrence out of the series with scope this', function () {
        $series = gym();
        $result = $this->tasks->setRecurrence(occ($series['id'], WED), null, Scope::This);
        $wednesday = $this->tasks->listTasksIn(WED);

        expect($result->kind)->toBe(ItemKind::Task)
            ->and($wednesday)->toHaveCount(1)
            ->and($wednesday[0]->id())->toBe($result->id())
            ->and($wednesday[0]->kind)->toBe(ItemKind::Task)
            ->and(shown())->toHaveCount(6);
    });
});

describe('editing a series row', function () {
    it('applies to every occurrence without exceptions', function () {
        $series = gym();

        $this->tasks->updateTask(occ($series['id'], WED), ['text' => 'Yoga']);
        $this->tasks->updateTask($series['id'], ['text' => 'Run', 'done' => true]);

        expect(shown())->toBe(['Run@'.MON, 'Yoga@'.WED, 'Run@'.FRI, 'Run@'.NEXT_MON, 'Run@'.NEXT_WED, 'Run@'.NEXT_FRI])
            ->and(recRow($series['id'])['done'])->toBeFalse();
    });

    it('replaces or removes the rule', function () {
        $series = gym();
        $exception = $this->tasks->toggleDone(occ($series['id'], WED));

        $this->tasks->setRecurrence($series['id'], ['type' => 'weekly', 'weekdays' => [1]]);

        expect(shown())->toBe(['Gym@'.MON, 'Gym✓@'.WED, 'Gym@'.NEXT_MON]);

        $this->tasks->setRecurrence($series['id'], null);

        expect(shown())->toBe(['Gym@'.MON])
            ->and(recRow($exception->id())['deleted_at'])->not->toBeNull();
    });

    it('deletes a series with its exceptions', function () {
        $series = gym();

        $this->tasks->toggleDone(occ($series['id'], WED));
        $this->tasks->deleteTask($series['id']);

        expect(shown())->toBe([]);
    });

    it('cannot be moved', function () {
        $series = gym();

        expect(fn () => $this->tasks->moveTask($series['id'], TUE))->toThrow(InvalidTaskChange::class);
    });
});

describe('monthly series', function () {
    it('repeats on the last day of shorter months', function () {
        $task = $this->tasks->createTask(['text' => 'Rent', 'date' => '2026-01-31']);

        $this->tasks->setRecurrence($task['id'], ['type' => 'monthly', 'day' => 31]);

        expect(shown('2026-02-28', '2026-02-28'))->toBe(['Rent@2026-02-28'])
            ->and(shown('2026-04-30', '2026-04-30'))->toBe(['Rent@2026-04-30']);
    });
});

describe('series every N days', function () {
    $every3 = ['type' => 'daily', 'every' => 3];

    it('repeats every N days from its date', function () use ($every3) {
        gym($every3);

        expect(shown())->toBe(['Gym@'.MON, 'Gym@2026-10-15', 'Gym@2026-10-18', 'Gym@2026-10-21', 'Gym@2026-10-24']);
    });

    it('keeps the cadence when this and all future are edited', function () use ($every3) {
        $series = gym($every3);

        $this->tasks->updateTask(occ($series['id'], '2026-10-18'), ['text' => 'Run'], Scope::Future);

        expect(shown())->toBe(['Gym@'.MON, 'Gym@2026-10-15', 'Run@2026-10-18', 'Run@2026-10-21', 'Run@2026-10-24'])
            ->and(recRow($series['id'])['recurrence'])->toBe([...$every3, 'until' => '2026-10-17']);
    });

    it('changes N for this and all future from an occurrence', function () use ($every3) {
        $series = gym($every3);

        $this->tasks->setRecurrence(occ($series['id'], '2026-10-15'), ['type' => 'daily', 'every' => 5], Scope::Future);

        expect(shown())->toBe(['Gym@'.MON, 'Gym@2026-10-15', 'Gym@2026-10-20', 'Gym@2026-10-25']);
    });

    it('changes N for the whole series from its first occurrence', function () use ($every3) {
        $series = gym($every3);

        $this->tasks->setRecurrence(occ($series['id'], MON), ['type' => 'daily', 'every' => 21]);

        expect(shown())->toBe(['Gym@'.MON])
            ->and(dayKinds('2026-11-02'))->toBe(['occurrence']);
    });

    it('moves and deletes single occurrences', function () use ($every3) {
        $series = gym($every3);

        $this->tasks->moveTask(occ($series['id'], '2026-10-15'), FRI);
        $this->tasks->deleteTask(occ($series['id'], '2026-10-21'));

        expect(shown())->toBe(['Gym@'.MON, 'Gym@'.FRI, 'Gym@2026-10-18', 'Gym@2026-10-24']);
    });
});
