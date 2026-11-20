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
    // Friday 20 Nov 2026, 10:00 in Madrid.
    Date::setTestNow('2026-11-20 09:00:00');
    $this->user = User::factory()->create(['timezone' => 'Europe/Madrid']);
    $this->token = personalToken($this->user);
    $this->tasks = TaskRepository::for($this->user);
});

test('the server lists every planner tool with its annotations and a closed schema', function () {
    $tools = collect(mcp($this->token, 'tools/list')->assertOk()->json('result.tools'))->keyBy('name');

    expect($tools->keys()->sort()->values()->all())->toBe([
        'carry_over', 'create_tasks', 'delete_task', 'duplicate_task', 'export_tasks', 'get_profile', 'get_task',
        'import_tasks', 'list_someday', 'list_tasks', 'move_task', 'restore_task', 'search_tasks', 'set_recurrence',
        'set_subtasks', 'update_task',
    ]);

    foreach (['list_tasks', 'list_someday', 'get_task', 'search_tasks', 'export_tasks'] as $name) {
        expect($tools[$name]['annotations']['readOnlyHint'])->toBeTrue("{$name} is read-only");
    }

    foreach (['create_tasks', 'update_task', 'set_subtasks', 'move_task', 'duplicate_task', 'set_recurrence', 'restore_task', 'carry_over', 'import_tasks'] as $name) {
        expect($tools[$name]['annotations'])->not->toHaveKey('readOnlyHint')
            ->and($tools[$name]['annotations']['destructiveHint'])->toBeFalse("{$name} is not destructive");
    }

    expect($tools['delete_task']['annotations']['destructiveHint'])->toBeTrue()
        ->and($tools['list_tasks']['inputSchema']['additionalProperties'])->toBeFalse()
        ->and($tools['list_tasks']['inputSchema']['required'])->toBe(['from', 'to'])
        ->and($tools['create_tasks']['inputSchema']['properties']['tasks']['items']['additionalProperties'])->toBeFalse();
});

test('a tool refuses arguments it does not declare', function () {
    expect(toolError($this->token, 'list_tasks', ['from' => '2026-11-16', 'to' => '2026-11-22', 'tz' => 'UTC']))
        ->toBe('Unknown argument: tz. This tool takes: from, to.')
        ->and(toolError($this->token, 'carry_over', ['date' => '2026-11-20']))
        ->toBe('Unknown argument: date. This tool takes no arguments.');
});

describe('list_tasks', function () {
    test('lists every day of the range in planner order, occurrences and done tasks included', function () {
        $untimed = $this->tasks->createTask(['text' => 'Untimed', 'date' => '2026-11-17']);
        $timed = $this->tasks->createTask(['text' => 'Call Ana', 'date' => '2026-11-17', 'time' => '09:30']);
        $done = $this->tasks->createTask(['text' => 'Done', 'date' => '2026-11-18']);
        $this->tasks->toggleDone($done['id']);
        $gym = $this->tasks->createTask(['text' => 'Gym', 'date' => '2026-11-16']);
        $this->tasks->setRecurrence($gym['id'], ['type' => 'weekly', 'weekdays' => [1, 3]]);
        $this->tasks->createTask(['text' => 'Someday', 'date' => null]);

        $result = toolResult($this->token, 'list_tasks', ['from' => '2026-11-16', 'to' => '2026-11-22']);

        expect($result['today'])->toBe('2026-11-20')
            ->and($result['days'])->toHaveCount(7)
            ->and($result['days'][0])->toMatchArray(['date' => '2026-11-16', 'weekday' => 'Monday'])
            ->and($result['days'][0]['tasks'][0])->toMatchArray([
                'id' => "{$gym['id']}:2026-11-16",
                'kind' => 'occurrence',
                'text' => 'Gym',
                'series_id' => $gym['id'],
                'occurrence_date' => '2026-11-16',
            ])
            ->and(array_column($result['days'][1]['tasks'], 'id'))->toBe([$timed['id'], $untimed['id']])
            ->and(array_column($result['days'][2]['tasks'], 'text'))->toBe(['Done', 'Gym'])
            ->and($result['days'][2]['tasks'][0]['done'])->toBeTrue()
            ->and($result['days'][6]['tasks'])->toBe([]);

        // Plain tasks carry no series fields.
        expect($result['days'][1]['tasks'][0])->not->toHaveKey('series_id')->not->toHaveKey('recurrence');
    });

    test('caps the range and checks the dates', function () {
        expect(toolError($this->token, 'list_tasks', ['from' => '2026-01-01', 'to' => '2026-12-31']))
            ->toBe('The range is too long: ask for at most 92 days at a time.')
            ->and(toolError($this->token, 'list_tasks', ['from' => '2026-11-22', 'to' => '2026-11-16']))
            ->toContain('to')
            ->and(toolError($this->token, 'list_tasks', ['from' => 'tomorrow', 'to' => '2026-11-16']))
            ->toContain('from');

        expect(toolResult($this->token, 'list_tasks', ['from' => '2026-11-01', 'to' => '2027-01-31'])['days'])->toHaveCount(92);
    });

    test('never shows another user\'s tasks', function () {
        TaskRepository::for(User::factory()->create())->createTask(['text' => 'Not mine', 'date' => '2026-11-20']);

        expect(toolResult($this->token, 'list_tasks', ['from' => '2026-11-20', 'to' => '2026-11-20'])['days'][0]['tasks'])->toBe([]);
    });

    test('does not log reads', function () {
        toolResult($this->token, 'list_tasks', ['from' => '2026-11-20', 'to' => '2026-11-20']);

        expect(McpActivity::count())->toBe(0);
    });
});

describe('list_someday', function () {
    test('hides tasks done before this week unless asked', function () {
        Date::setTestNow('2026-11-10 09:00:00');
        $open = $this->tasks->createTask(['text' => 'Read a book', 'date' => null]);
        $old = $this->tasks->createTask(['text' => 'Done last week', 'date' => null]);
        $recent = $this->tasks->createTask(['text' => 'Done this week', 'date' => null]);

        Date::setTestNow('2026-11-15 22:00:00'); // Sunday 23:00 in Madrid: last week
        $this->tasks->toggleDone($old['id']);
        Date::setTestNow('2026-11-15 23:30:00'); // Monday 00:30 in Madrid: this week
        $this->tasks->toggleDone($recent['id']);
        Date::setTestNow('2026-11-20 09:00:00');

        $result = toolResult($this->token, 'list_someday');

        expect(array_column($result['tasks'], 'id'))->toBe([$open['id'], $recent['id']])
            ->and($result['archived_hidden'])->toBe(1)
            ->and($result['tasks'][0]['date'])->toBeNull();

        $all = toolResult($this->token, 'list_someday', ['include_archived' => true]);

        expect(array_column($all['tasks'], 'id'))->toBe([$open['id'], $old['id'], $recent['id']])
            ->and($all['archived_hidden'])->toBe(0);
    });
});

describe('get_task', function () {
    test('returns a plain task', function () {
        $task = $this->tasks->createTask(['text' => 'Buy milk', 'date' => '2026-11-20', 'notes' => 'Oat']);

        expect(toolResult($this->token, 'get_task', ['id' => $task['id']]))->toBe([
            'task' => [
                'id' => $task['id'], 'kind' => 'task', 'text' => 'Buy milk', 'date' => '2026-11-20', 'done' => false,
                'color' => 'none', 'time' => null, 'notes' => 'Oat', 'subtasks' => [],
            ],
            'series' => null,
        ]);
    });

    test('resolves an occurrence id and returns its series', function () {
        $gym = $this->tasks->createTask(['text' => 'Gym', 'date' => '2026-11-16']);
        $this->tasks->setRecurrence($gym['id'], ['type' => 'daily', 'every' => 2]);

        $result = toolResult($this->token, 'get_task', ['id' => "{$gym['id']}:2026-11-18"]);

        expect($result['task']['kind'])->toBe('occurrence')
            ->and($result['series'])->toMatchArray([
                'id' => $gym['id'],
                'kind' => 'series',
                'recurrence' => ['type' => 'daily', 'every' => 2],
            ]);

        // A changed occurrence resolves to its exception row.
        $exception = $this->tasks->updateTask("{$gym['id']}:2026-11-18", ['text' => 'Gym (legs)']);

        $result = toolResult($this->token, 'get_task', ['id' => "{$gym['id']}:2026-11-18"]);

        expect($result['task'])->toMatchArray(['id' => $exception->id(), 'kind' => 'exception', 'text' => 'Gym (legs)'])
            ->and($result['series']['id'])->toBe($gym['id']);
    });

    test('says when a task does not exist, was deleted or is not the user\'s', function () {
        $deleted = $this->tasks->createTask(['text' => 'Gone', 'date' => '2026-11-20']);
        $this->tasks->deleteTask($deleted['id']);
        $other = TaskRepository::for(User::factory()->create())->createTask(['text' => 'Not mine', 'date' => '2026-11-20']);
        $gym = $this->tasks->createTask(['text' => 'Gym', 'date' => '2026-11-16']);
        $this->tasks->setRecurrence($gym['id'], ['type' => 'weekly', 'weekdays' => [1]]);

        expect(toolError($this->token, 'get_task', ['id' => $deleted['id']]))->toBe("Task {$deleted['id']} does not exist.")
            ->and(toolError($this->token, 'get_task', ['id' => $other['id']]))->toBe("Task {$other['id']} does not exist.")
            ->and(toolError($this->token, 'get_task', ['id' => "{$gym['id']}:2026-11-17"]))->toContain('does not exist')
            ->and(toolError($this->token, 'get_task', []))->toContain('id');
    });
});

describe('search_tasks', function () {
    beforeEach(function () {
        $this->milk = $this->tasks->createTask(['text' => 'Buy MILK', 'date' => '2026-11-20']);
        $this->notes = $this->tasks->createTask(['text' => 'Groceries', 'date' => '2026-11-10', 'notes' => 'milk and eggs', 'color' => 'green']);
        $this->subtask = $this->tasks->createTask(['text' => 'Shopping', 'date' => null, 'subtasks' => [['id' => 's1', 'text' => 'Oat milk', 'done' => false]]]);
        $this->series = $this->tasks->createTask(['text' => 'Milk the cow', 'date' => '2026-11-02']);
        $this->tasks->setRecurrence($this->series['id'], ['type' => 'daily', 'every' => 1, 'until' => '2026-11-08']);
        $this->tasks->createTask(['text' => 'Unrelated', 'date' => '2026-11-20']);
    });

    test('matches text, notes and subtasks, case-insensitively, by date with Someday last', function () {
        $result = toolResult($this->token, 'search_tasks', ['query' => 'milk']);

        expect(array_column($result['tasks'], 'id'))->toBe([$this->series['id'], $this->notes['id'], $this->milk['id'], $this->subtask['id']])
            ->and($result['tasks'][0]['kind'])->toBe('series')
            ->and($result['total'])->toBe(4)
            ->and($result['next_cursor'])->toBeNull();
    });

    test('filters by range, done, color and recurring', function () {
        $this->tasks->toggleDone($this->milk['id']);

        $ids = fn (array $arguments) => array_column(toolResult($this->token, 'search_tasks', ['query' => 'milk', ...$arguments])['tasks'], 'id');

        expect($ids(['from' => '2026-11-09', 'to' => '2026-11-30']))->toBe([$this->notes['id'], $this->milk['id']])
            ->and($ids(['from' => '2026-11-05', 'to' => '2026-11-06']))->toBe([$this->series['id']])
            ->and($ids(['done' => true]))->toBe([$this->milk['id']])
            ->and($ids(['color' => 'green']))->toBe([$this->notes['id']])
            ->and($ids(['recurring' => true]))->toBe([$this->series['id']])
            ->and($ids(['recurring' => false]))->toHaveCount(3);
    });

    test('pages with a cursor', function () {
        $first = toolResult($this->token, 'search_tasks', ['query' => 'milk', 'limit' => 3]);
        $second = toolResult($this->token, 'search_tasks', ['query' => 'milk', 'limit' => 3, 'cursor' => $first['next_cursor']]);

        expect($first['tasks'])->toHaveCount(3)
            ->and($first['next_cursor'])->toBe('3')
            ->and(array_column($second['tasks'], 'id'))->toBe([$this->subtask['id']])
            ->and($second['next_cursor'])->toBeNull()
            ->and(toolError($this->token, 'search_tasks', ['query' => 'milk', 'cursor' => 'abc']))->toBe('The cursor is not one this tool returned.')
            ->and(toolError($this->token, 'search_tasks', ['query' => 'milk', 'limit' => 500]))->toContain('limit');
    });
});

describe('export_tasks', function () {
    test('returns the export file with the same rows as the client export', function () {
        Date::setTestNow('2026-11-20 09:00:00.250');
        $kept = $this->tasks->createTask(['text' => 'Kept', 'date' => '2026-11-20']);
        $deleted = $this->tasks->createTask(['text' => 'Deleted', 'date' => '2026-11-20']);
        $this->tasks->deleteTask($deleted['id']);
        $gym = $this->tasks->createTask(['text' => 'Gym', 'date' => '2026-11-16']);
        $this->tasks->setRecurrence($gym['id'], ['type' => 'daily', 'every' => 1]);
        $hidden = $this->tasks->deleteTask("{$gym['id']}:2026-11-17");

        $file = toolResult($this->token, 'export_tasks');

        expect($file['format'])->toBe('plain-week')
            ->and($file['version'])->toBe(1)
            ->and($file['exported_at'])->toBe('2026-11-20T09:00:00.250Z')
            ->and(collect($file['tasks'])->pluck('id')->sort()->values()->all())
            ->toBe(collect([$kept['id'], $gym['id'], $hidden['id']])->sort()->values()->all())
            ->and(collect($file['tasks'])->firstWhere('id', $hidden['id'])['deleted_at'])->not->toBeNull()
            ->and(array_keys($file['tasks'][0]))->toBe(array_keys(Task::query()->first()->toRecord()));
    });
});

describe('in SaaS mode', function () {
    test('planner tools need a paid plan', function () {
        enableSaas();

        expect(toolError($this->token, 'list_tasks', ['from' => '2026-11-16', 'to' => '2026-11-22']))
            ->toContain('needs a paid plan')
            ->and(toolError($this->token, 'create_tasks', ['tasks' => [['text' => 'Nope']]]))
            ->toContain(route('billing.plans'))
            ->and(Task::count())->toBe(0)
            ->and(McpActivity::count())->toBe(0);
    });

    test('a subscriber uses them', function () {
        enableSaas();
        $token = personalToken(weeklySubscriber());

        expect(toolResult($token, 'list_someday'))->toBe(['tasks' => [], 'archived_hidden' => 0]);
    });
});
