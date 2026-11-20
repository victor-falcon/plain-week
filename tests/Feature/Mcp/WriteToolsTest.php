<?php

use App\Models\McpActivity;
use App\Models\Task;
use App\Models\User;
use App\Tasks\TaskRepository;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Date;

uses(RefreshDatabase::class);

beforeEach(function () {
    usePassportKeys();
    // Friday 20 Nov 2026 in Madrid (00:30), still Thursday in UTC.
    Date::setTestNow('2026-11-19 23:30:00');
    $this->user = User::factory()->create(['timezone' => 'Europe/Madrid']);
    $this->token = personalToken($this->user, 'Laptop');
    $this->tasks = TaskRepository::for($this->user);
});

/**
 * Texts of a day (or Someday) in position order.
 *
 * @return list<string>
 */
function textsIn(TaskRepository $tasks, ?string $date): array
{
    return array_map(fn ($item) => $item->task['text'], $tasks->listTasksIn($date));
}

describe('create_tasks', function () {
    test('creates a batch, today by default and Someday with a null date', function () {
        $result = toolResult($this->token, 'create_tasks', ['tasks' => [
            ['text' => 'Buy milk', 'color' => 'green', 'time' => '18:00', 'notes' => 'Oat', 'subtasks' => [['text' => 'Check fridge'], ['text' => 'Shop', 'done' => true]]],
            ['text' => 'Read a book', 'date' => null],
            ['text' => 'Dentist', 'date' => '2026-11-23'],
        ]]);

        expect($result['created'])->toHaveCount(3)
            ->and($result['created'][0])->toMatchArray([
                'kind' => 'task', 'text' => 'Buy milk', 'date' => '2026-11-20', 'color' => 'green', 'time' => '18:00', 'notes' => 'Oat',
            ])
            ->and(array_column($result['created'][0]['subtasks'], 'text'))->toBe(['Check fridge', 'Shop'])
            ->and(array_column($result['created'][0]['subtasks'], 'done'))->toBe([false, true])
            ->and($result['created'][1]['date'])->toBeNull()
            ->and(Task::query()->where('user_id', $this->user->id)->count())->toBe(3)
            ->and(textsIn($this->tasks, null))->toBe(['Read a book']);
    });

    test('keeps the batch order after the same after_id, and places before_id', function () {
        $first = $this->tasks->createTask(['text' => 'First', 'date' => '2026-11-23']);
        $this->tasks->createTask(['text' => 'Last', 'date' => '2026-11-23']);

        toolResult($this->token, 'create_tasks', ['tasks' => [
            ['text' => 'A', 'date' => '2026-11-23', 'after_id' => $first['id']],
            ['text' => 'B', 'date' => '2026-11-23', 'after_id' => $first['id']],
            ['text' => 'C', 'date' => '2026-11-23', 'after_id' => $first['id']],
            ['text' => 'Zero', 'date' => '2026-11-23', 'before_id' => $first['id']],
        ]]);

        expect(textsIn($this->tasks, '2026-11-23'))->toBe(['Zero', 'First', 'A', 'B', 'C', 'Last']);
    });

    test('keeps the batch order after the same after_id with other tasks in between', function () {
        $first = $this->tasks->createTask(['text' => 'First', 'date' => '2026-11-23']);

        toolResult($this->token, 'create_tasks', ['tasks' => [
            ['text' => 'A', 'date' => '2026-11-23', 'after_id' => $first['id']],
            ['text' => 'Elsewhere', 'date' => '2026-11-24'],
            ['text' => 'B', 'date' => '2026-11-23', 'after_id' => $first['id']],
        ]]);

        expect(textsIn($this->tasks, '2026-11-23'))->toBe(['First', 'A', 'B']);
    });

    test('creates a recurring task and returns its first occurrence', function () {
        $result = toolResult($this->token, 'create_tasks', ['tasks' => [
            ['text' => 'Gym', 'date' => '2026-11-23', 'recurrence' => ['type' => 'weekly', 'weekdays' => [3, 1]]],
        ]]);
        $created = $result['created'][0];

        expect($created['kind'])->toBe('occurrence')
            ->and($created['id'])->toBe("{$created['series_id']}:2026-11-23")
            ->and(Task::find($created['series_id'])->recurrence)->toBe(['type' => 'weekly', 'weekdays' => [1, 3]]);
    });

    test('creates nothing when one task is refused, and names it', function () {
        expect(toolError($this->token, 'create_tasks', ['tasks' => [
            ['text' => 'Fine'],
            ['text' => 'Repeat in Someday', 'date' => null, 'recurrence' => ['type' => 'daily', 'every' => 1]],
        ]]))->toBe('Task 2: A Someday task cannot repeat.')
            ->and(toolError($this->token, 'create_tasks', ['tasks' => [
                ['text' => 'Bad rule', 'recurrence' => ['type' => 'weekly', 'weekdays' => []]],
            ]]))->toContain('Task 1:')
            ->and(toolError($this->token, 'create_tasks', ['tasks' => [
                ['text' => 'Lost', 'date' => '2026-11-23', 'after_id' => 'nope'],
            ]]))->toBe('Task 1: after_id nope is not a task in 2026-11-23. Use the id of a task listed there (occurrences by their occurrence id), or leave it out to add at the end.')
            ->and(Task::count())->toBe(0)
            ->and(McpActivity::count())->toBe(0);
    });

    test('validates the batch: size, unknown keys, fields', function () {
        $tasks = array_fill(0, 101, ['text' => 'Too many']);

        expect(toolError($this->token, 'create_tasks', ['tasks' => $tasks]))->toContain('100')
            ->and(toolError($this->token, 'create_tasks', ['tasks' => [['text' => 'X', 'priority' => 'high']]]))->toContain('tasks.0')
            ->and(toolError($this->token, 'create_tasks', ['tasks' => [['text' => 'X', 'color' => 'red']]]))->toContain('color')
            ->and(toolError($this->token, 'create_tasks', ['tasks' => [['text' => 'X', 'time' => '25:00']]]))->toContain('time')
            ->and(toolError($this->token, 'create_tasks', ['tasks' => [['text' => '']]]))->toContain('text')
            ->and(toolError($this->token, 'create_tasks', ['tasks' => []]))->toContain('tasks')
            ->and(Task::count())->toBe(0);
    });
});

describe('update_task', function () {
    test('changes the given fields and logs it', function () {
        $task = $this->tasks->createTask(['text' => 'Buy milk', 'date' => '2026-11-20']);

        $result = toolResult($this->token, 'update_task', ['id' => $task['id'], 'text' => 'Buy oat milk', 'color' => 'pink', 'time' => '08:15']);

        expect($result['task'])->toMatchArray(['id' => $task['id'], 'text' => 'Buy oat milk', 'color' => 'pink', 'time' => '08:15'])
            ->and(McpActivity::sole()->summary)->toBe('Updated “Buy oat milk” (text, color, time)');

        toolResult($this->token, 'update_task', ['id' => $task['id'], 'text' => 'Buy oat milk today']);

        expect(McpActivity::query()->latest('id')->first()->summary)->toBe('Renamed “Buy oat milk” to “Buy oat milk today”');

        toolResult($this->token, 'update_task', ['id' => $task['id'], 'done' => true]);

        expect(Task::find($task['id'])->done)->toBeTrue()
            ->and(Task::find($task['id'])->done_at)->not->toBeNull()
            ->and(McpActivity::query()->latest('id')->first()->summary)->toBe('Completed “Buy oat milk today”');
    });

    test('rejects fields it does not change, and an empty patch', function () {
        $task = $this->tasks->createTask(['text' => 'Buy milk', 'date' => '2026-11-20']);

        expect(toolError($this->token, 'update_task', ['id' => $task['id'], 'date' => '2026-11-21']))
            ->toBe('Unknown argument: date. This tool takes: id, text, done, color, time, notes, scope.')
            ->and(toolError($this->token, 'update_task', ['id' => $task['id']]))
            ->toBe('Nothing to change: give at least one of text, done, color, time, notes.')
            ->and(toolError($this->token, 'update_task', ['id' => 'missing', 'text' => 'X']))
            ->toBe('Task missing does not exist.');
    });

    test('scopes a change of an occurrence to this one or to this and the future', function () {
        $gym = $this->tasks->createTask(['text' => 'Gym', 'date' => '2026-11-16']);
        $this->tasks->setRecurrence($gym['id'], ['type' => 'daily', 'every' => 1]);

        $done = toolResult($this->token, 'update_task', ['id' => "{$gym['id']}:2026-11-18", 'done' => true]);

        expect($done['task'])->toMatchArray(['kind' => 'exception', 'done' => true, 'series_id' => $gym['id'], 'occurrence_date' => '2026-11-18']);

        $future = toolResult($this->token, 'update_task', ['id' => "{$gym['id']}:2026-11-20", 'text' => 'Run', 'scope' => 'future']);

        expect($future['task']['kind'])->toBe('occurrence')
            ->and($future['task']['series_id'])->not->toBe($gym['id'])
            ->and(Task::find($gym['id'])->recurrence['until'])->toBe('2026-11-19')
            ->and(McpActivity::query()->latest('id')->first()->summary)->toBe('Renamed “Gym” to “Run” and its later occurrences')
            ->and(toolError($this->token, 'update_task', ['id' => "{$future['task']['series_id']}:2026-11-21", 'done' => true, 'scope' => 'future']))
            ->toContain('use scope "this"');
    });
});

describe('set_subtasks', function () {
    test('applies the operations in order', function () {
        $task = $this->tasks->createTask(['text' => 'Trip', 'date' => '2026-11-20', 'subtasks' => [
            ['id' => 'a', 'text' => 'Tickets', 'done' => false],
            ['id' => 'b', 'text' => 'Hotel', 'done' => false],
            ['id' => 'c', 'text' => 'Old', 'done' => false],
        ]]);

        $result = toolResult($this->token, 'set_subtasks', ['id' => $task['id'], 'operations' => [
            ['op' => 'add', 'text' => 'Passport'],
            ['op' => 'edit', 'id' => 'b', 'text' => 'Hotel in Rome'],
            ['op' => 'toggle', 'id' => 'a'],
            ['op' => 'toggle', 'id' => 'b', 'done' => false],
            ['op' => 'remove', 'id' => 'c'],
        ]]);
        $subtasks = $result['task']['subtasks'];

        expect(array_column($subtasks, 'text'))->toBe(['Tickets', 'Hotel in Rome', 'Passport'])
            ->and(array_column($subtasks, 'done'))->toBe([true, false, false])
            ->and(McpActivity::sole()->summary)->toBe('Changed the subtasks of “Trip”: added 1 subtask, edited 1 subtask, checked 2 subtasks, removed 1 subtask');

        $reordered = toolResult($this->token, 'set_subtasks', ['id' => $task['id'], 'operations' => [
            ['op' => 'reorder', 'ids' => [$subtasks[2]['id'], 'a', 'b']],
        ]]);

        expect(array_column($reordered['task']['subtasks'], 'text'))->toBe(['Passport', 'Tickets', 'Hotel in Rome']);
    });

    test('changes nothing when an operation fails', function () {
        $task = $this->tasks->createTask(['text' => 'Trip', 'date' => '2026-11-20', 'subtasks' => [['id' => 'a', 'text' => 'Tickets', 'done' => false]]]);

        expect(toolError($this->token, 'set_subtasks', ['id' => $task['id'], 'operations' => [
            ['op' => 'add', 'text' => 'Passport'],
            ['op' => 'remove', 'id' => 'zzz'],
        ]]))->toBe('Operation 2: subtask zzz does not exist on this task.')
            ->and(toolError($this->token, 'set_subtasks', ['id' => $task['id'], 'operations' => [['op' => 'reorder', 'ids' => ['b']]]]))
            ->toContain('reorder needs every subtask id exactly once')
            ->and(toolError($this->token, 'set_subtasks', ['id' => $task['id'], 'operations' => [['op' => 'edit', 'id' => 'a']]]))
            ->toContain('text')
            ->and(Task::find($task['id'])->subtasks)->toBe([['id' => 'a', 'text' => 'Tickets', 'done' => false]])
            ->and(McpActivity::count())->toBe(0);
    });
});

describe('move_task', function () {
    test('moves to another day between tasks, and to Someday', function () {
        $task = $this->tasks->createTask(['text' => 'Move me', 'date' => '2026-11-20']);
        $a = $this->tasks->createTask(['text' => 'A', 'date' => '2026-11-24']);
        $this->tasks->createTask(['text' => 'B', 'date' => '2026-11-24']);

        $result = toolResult($this->token, 'move_task', ['id' => $task['id'], 'date' => '2026-11-24', 'after_id' => $a['id']]);

        expect($result['task']['date'])->toBe('2026-11-24')
            ->and(textsIn($this->tasks, '2026-11-24'))->toBe(['A', 'Move me', 'B'])
            ->and(McpActivity::sole()->summary)->toBe('Moved “Move me” to Tue 24 Nov');

        toolResult($this->token, 'move_task', ['id' => $task['id'], 'date' => null]);

        expect(textsIn($this->tasks, null))->toBe(['Move me'])
            ->and(McpActivity::query()->latest('id')->first()->summary)->toBe('Moved “Move me” to Someday');
    });

    test('moves one occurrence, never a series, and checks the neighbours', function () {
        $gym = $this->tasks->createTask(['text' => 'Gym', 'date' => '2026-11-16']);
        $this->tasks->setRecurrence($gym['id'], ['type' => 'daily', 'every' => 1]);

        $moved = toolResult($this->token, 'move_task', ['id' => "{$gym['id']}:2026-11-20", 'date' => '2026-11-21']);

        expect($moved['task'])->toMatchArray(['kind' => 'exception', 'date' => '2026-11-21', 'occurrence_date' => '2026-11-20'])
            ->and(toolError($this->token, 'move_task', ['id' => $gym['id'], 'date' => '2026-11-21']))->toStartWith('A recurring series cannot be moved as a whole')
            ->and(toolError($this->token, 'move_task', ['id' => $moved['task']['id'], 'date' => '2026-11-22', 'before_id' => 'elsewhere']))
            ->toStartWith('before_id elsewhere is not a task in 2026-11-22.')
            ->and(toolError($this->token, 'move_task', ['id' => $moved['task']['id']]))->toContain('date');
    });
});

describe('duplicate_task', function () {
    test('copies a task right after it with new ids', function () {
        $task = $this->tasks->createTask(['text' => 'Write', 'date' => '2026-11-20', 'subtasks' => [['id' => 's', 'text' => 'Outline', 'done' => true]]]);
        $this->tasks->createTask(['text' => 'Next', 'date' => '2026-11-20']);

        $copy = toolResult($this->token, 'duplicate_task', ['id' => $task['id']])['task'];

        expect($copy['id'])->not->toBe($task['id'])
            ->and($copy['subtasks'][0]['id'])->not->toBe('s')
            ->and($copy['subtasks'][0]['text'])->toBe('Outline')
            ->and(textsIn($this->tasks, '2026-11-20'))->toBe(['Write', 'Write', 'Next'])
            ->and(McpActivity::sole()->summary)->toBe('Duplicated “Write” on Fri 20 Nov');
    });
});

describe('set_recurrence', function () {
    test('makes a task repeat, changes the rule and stops it', function () {
        $task = $this->tasks->createTask(['text' => 'Water plants', 'date' => '2026-11-20']);

        $repeating = toolResult($this->token, 'set_recurrence', ['id' => $task['id'], 'recurrence' => ['type' => 'daily', 'every' => 3]]);

        expect($repeating['task'])->toMatchArray(['kind' => 'occurrence', 'id' => "{$task['id']}:2026-11-20"])
            ->and($repeating['series']['recurrence'])->toBe(['type' => 'daily', 'every' => 3])
            ->and(McpActivity::sole()->summary)->toBe('Set “Water plants” to repeat every 3 days');

        toolResult($this->token, 'set_recurrence', ['id' => $task['id'], 'recurrence' => ['type' => 'monthly', 'day' => 20, 'until' => '2027-03-20']]);

        expect(McpActivity::query()->latest('id')->first()->summary)->toBe('Set “Water plants” to repeat monthly on day 20 until Sat 20 Mar 2027');

        $plain = toolResult($this->token, 'set_recurrence', ['id' => $task['id'], 'recurrence' => null]);

        expect($plain['task']['kind'])->toBe('task')
            ->and($plain['series'])->toBeNull()
            ->and(McpActivity::query()->latest('id')->first()->summary)->toBe('Stopped “Water plants” repeating');
    });

    test('takes one occurrence out with scope this', function () {
        $gym = $this->tasks->createTask(['text' => 'Gym', 'date' => '2026-11-16']);
        $this->tasks->setRecurrence($gym['id'], ['type' => 'daily', 'every' => 1]);

        $result = toolResult($this->token, 'set_recurrence', ['id' => "{$gym['id']}:2026-11-18", 'recurrence' => null, 'scope' => 'this']);

        expect($result['task'])->toMatchArray(['kind' => 'task', 'date' => '2026-11-18'])
            ->and(Task::find($gym['id'])->recurrence)->toBe(['type' => 'daily', 'every' => 1]);
    });

    test('refuses Someday tasks and bad rules', function () {
        $someday = $this->tasks->createTask(['text' => 'Someday', 'date' => null]);
        $task = $this->tasks->createTask(['text' => 'Dated', 'date' => '2026-11-20']);

        expect(toolError($this->token, 'set_recurrence', ['id' => $someday['id'], 'recurrence' => ['type' => 'daily', 'every' => 1]]))
            ->toBe('A Someday task cannot repeat.')
            ->and(toolError($this->token, 'set_recurrence', ['id' => $task['id'], 'recurrence' => ['type' => 'monthly', 'day' => 40]]))
            ->toBe('A monthly rule needs a day from 1 to 31.')
            ->and(toolError($this->token, 'set_recurrence', ['id' => $task['id'], 'recurrence' => ['frequency' => 'weekly']]))
            ->toBe('A repeat rule is an object with only type, every, weekdays, day and until.')
            ->and(toolError($this->token, 'set_recurrence', ['id' => $task['id']]))->toContain('recurrence');
    });
});

describe('delete_task and restore_task', function () {
    test('deletes a task and restores it', function () {
        $task = $this->tasks->createTask(['text' => 'Oops', 'date' => '2026-11-20']);

        $deleted = toolResult($this->token, 'delete_task', ['id' => $task['id']]);

        expect($deleted)->toMatchArray(['restore_id' => $task['id'], 'scope' => null, 'series' => null])
            ->and($deleted['deleted']['text'])->toBe('Oops')
            ->and(Task::find($task['id'])->deleted_at)->not->toBeNull()
            ->and(McpActivity::sole()->summary)->toBe('Deleted “Oops”');

        $restored = toolResult($this->token, 'restore_task', ['id' => $deleted['restore_id']]);

        expect($restored['task']['id'])->toBe($task['id'])
            ->and(Task::find($task['id'])->deleted_at)->toBeNull()
            ->and(McpActivity::query()->latest('id')->first()->summary)->toBe('Restored “Oops” on Fri 20 Nov')
            ->and(toolError($this->token, 'restore_task', ['id' => $task['id']]))->toBe("Task {$task['id']} is not deleted.")
            ->and(toolError($this->token, 'restore_task', ['id' => 'missing']))->toBe('Task missing does not exist.');
    });

    test('does not restore one date of a deleted series before the series', function () {
        $gym = $this->tasks->createTask(['text' => 'Gym', 'date' => '2026-11-16']);
        $this->tasks->setRecurrence($gym['id'], ['type' => 'daily', 'every' => 1]);
        $occurrence = "{$gym['id']}:2026-11-18";
        toolResult($this->token, 'delete_task', ['id' => $occurrence]);
        toolResult($this->token, 'delete_task', ['id' => $gym['id']]);

        expect(toolError($this->token, 'restore_task', ['id' => $occurrence]))->toContain('Restore the series first');

        toolResult($this->token, 'restore_task', ['id' => $gym['id']]);

        expect(toolResult($this->token, 'restore_task', ['id' => $occurrence])['task']['kind'])->toBe('exception');
    });

    test('deletes one occurrence and brings it back by its occurrence id', function () {
        $gym = $this->tasks->createTask(['text' => 'Gym', 'date' => '2026-11-16']);
        $this->tasks->setRecurrence($gym['id'], ['type' => 'daily', 'every' => 1]);
        $occurrence = "{$gym['id']}:2026-11-18";

        $deleted = toolResult($this->token, 'delete_task', ['id' => $occurrence]);

        expect($deleted)->toMatchArray(['restore_id' => $occurrence, 'scope' => 'this'])
            ->and($this->tasks->findTask($occurrence))->toBeNull()
            ->and(McpActivity::sole()->summary)->toBe('Deleted “Gym” on Wed 18 Nov');

        expect(toolResult($this->token, 'restore_task', ['id' => $occurrence])['task']['occurrence_date'])->toBe('2026-11-18')
            ->and($this->tasks->findTask($occurrence))->not->toBeNull();
    });

    test('ends a series with scope future, and deletes a whole series', function () {
        $gym = $this->tasks->createTask(['text' => 'Gym', 'date' => '2026-11-16']);
        $this->tasks->setRecurrence($gym['id'], ['type' => 'daily', 'every' => 1]);

        $ended = toolResult($this->token, 'delete_task', ['id' => "{$gym['id']}:2026-11-20", 'scope' => 'future']);

        expect($ended['restore_id'])->toBeNull()
            ->and($ended['series']['recurrence']['until'])->toBe('2026-11-19')
            ->and(McpActivity::sole()->summary)->toBe('Deleted “Gym” from Fri 20 Nov on');

        $whole = toolResult($this->token, 'delete_task', ['id' => $gym['id']]);

        expect($whole['restore_id'])->toBe($gym['id'])
            ->and(Task::find($gym['id'])->deleted_at)->not->toBeNull()
            ->and(McpActivity::query()->latest('id')->first()->summary)->toBe('Deleted the recurring task “Gym”');
    });
});

describe('carry_over', function () {
    test('moves unfinished past tasks to the user\'s today', function () {
        $old = $this->tasks->createTask(['text' => 'Old', 'date' => '2026-11-17']);
        $done = $this->tasks->createTask(['text' => 'Done', 'date' => '2026-11-18']);
        $this->tasks->toggleDone($done['id']);
        $yesterday = $this->tasks->createTask(['text' => 'Yesterday', 'date' => '2026-11-19']);
        $this->tasks->createTask(['text' => 'Today', 'date' => '2026-11-20']);
        $gym = $this->tasks->createTask(['text' => 'Gym', 'date' => '2026-11-16']);
        $this->tasks->setRecurrence($gym['id'], ['type' => 'weekly', 'weekdays' => [1]]);

        $result = toolResult($this->token, 'carry_over');

        expect($result['today'])->toBe('2026-11-20')
            ->and($result['moved'])->toBe(2)
            ->and(array_column($result['tasks'], 'id'))->toBe([$old['id'], $yesterday['id']])
            ->and(textsIn($this->tasks, '2026-11-20'))->toBe(['Today', 'Old', 'Yesterday'])
            ->and(Task::find($done['id'])->date)->toBe('2026-11-18')
            ->and(McpActivity::sole())->toMatchArray([
                'summary' => 'Moved 2 unfinished tasks to today (Fri 20 Nov)',
                'task_ids' => [$old['id'], $yesterday['id']],
            ]);

        // Nothing to move: nothing logged.
        expect(toolResult($this->token, 'carry_over')['moved'])->toBe(0)
            ->and(McpActivity::count())->toBe(1);
    });
});

describe('import_tasks', function () {
    test('adds the tasks of an export file, as an object or a string', function () {
        $this->tasks->createTask(['text' => 'Existing', 'date' => '2026-11-20']);
        $gym = $this->tasks->createTask(['text' => 'Gym', 'date' => '2026-11-16']);
        $this->tasks->setRecurrence($gym['id'], ['type' => 'daily', 'every' => 1]);
        $file = toolResult($this->token, 'export_tasks');

        $result = toolResult($this->token, 'import_tasks', ['file' => $file]);

        expect($result)->toMatchArray(['added' => 2, 'recurring' => 1])
            ->and($result['task_ids'])->toHaveCount(2)
            ->and(array_count_values(textsIn($this->tasks, '2026-11-20')))->toBe(['Existing' => 2, 'Gym' => 2])
            ->and(McpActivity::sole()->summary)->toBe('Imported 2 tasks (1 repeating)');

        toolResult($this->token, 'import_tasks', ['file' => json_encode($file)]);

        expect(Task::query()->whereNull('deleted_at')->count())->toBe(6);
    });

    test('refuses files that are not exports, and too many tasks', function () {
        $tasks = array_map(fn () => wireTask(), range(1, 2001));

        expect(toolError($this->token, 'import_tasks', ['file' => 'not json']))->toBe('This file is not valid JSON.')
            ->and(toolError($this->token, 'import_tasks', ['file' => ['format' => 'other']]))->toBe('This is not a Plain Week export file.')
            ->and(toolError($this->token, 'import_tasks', ['file' => ['format' => 'plain-week', 'version' => 1, 'tasks' => [['id' => 'x']]]]))
            ->toStartWith('Task 1:')
            ->and(toolError($this->token, 'import_tasks', ['file' => ['format' => 'plain-week', 'version' => 1, 'tasks' => $tasks]]))
            ->toBe('This file has 2001 tasks; import at most 2000 per call (split the file).')
            ->and(Task::count())->toBe(0);
    });
});
