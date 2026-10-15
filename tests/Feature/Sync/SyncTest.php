<?php

use App\Models\Task;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Illuminate\Testing\TestResponse;

uses(RefreshDatabase::class);

/**
 * Build a full wire record.
 *
 * @param  array<string, mixed>  $overrides
 * @return array<string, mixed>
 */
function wireTask(array $overrides = []): array
{
    return array_merge([
        'id' => (string) Str::uuid7(),
        'text' => 'Buy milk',
        'date' => '2026-10-15',
        'someday_column' => null,
        'position' => 'a0',
        'done' => false,
        'done_at' => null,
        'color' => 'none',
        'time' => null,
        'notes' => '',
        'subtasks' => [],
        'created_at' => '2026-10-15T08:35:00.123Z',
        'updated_at' => '2026-10-15T08:35:00.123Z',
        'deleted_at' => null,
    ], $overrides);
}

/**
 * @param  list<array<string, mixed>>  $tasks
 */
function push(array $tasks): TestResponse
{
    return test()->postJson(route('sync.push'), ['tasks' => $tasks]);
}

beforeEach(function () {
    $this->user = User::factory()->create();
    $this->actingAs($this->user);
});

test('push creates a task and pull returns it unchanged', function () {
    $task = wireTask([
        'text' => '  Spaced  ',
        'time' => '09:30',
        'color' => 'cornflower',
        'notes' => "Line one\nLine two",
        'subtasks' => [['id' => 's1', 'text' => 'Step', 'done' => true]],
        'done' => true,
        'done_at' => '2026-10-15T09:00:00.007Z',
    ]);

    push([$task])
        ->assertOk()
        ->assertExactJson(['applied' => [$task['id']], 'rejected' => [], 'cursor' => 1]);

    $this->getJson(route('sync.pull'))
        ->assertOk()
        ->assertExactJson(['tasks' => [$task], 'cursor' => 1, 'has_more' => false]);

    expect(Task::find($task['id']))->user_id->toBe($this->user->id);
});

test('push creates a someday task', function () {
    $task = wireTask(['date' => null, 'someday_column' => 2]);

    push([$task])->assertOk()->assertJsonPath('applied', [$task['id']]);

    $this->getJson(route('sync.pull'))->assertJsonPath('tasks.0', $task);
});

test('push updates an existing task', function () {
    $task = wireTask();
    push([$task]);

    $updated = [...$task, 'text' => 'Buy oat milk', 'updated_at' => '2026-10-15T08:40:00.000Z'];
    push([$updated])->assertOk()->assertJsonPath('applied', [$task['id']]);

    $this->getJson(route('sync.pull'))
        ->assertJsonCount(1, 'tasks')
        ->assertJsonPath('tasks.0', $updated);
});

test('last write wins: an older updated_at is ignored', function () {
    $task = wireTask(['updated_at' => '2026-10-15T10:00:00.500Z']);
    push([$task]);

    push([[...$task, 'text' => 'Stale', 'updated_at' => '2026-10-15T10:00:00.499Z']])
        ->assertOk()
        ->assertExactJson(['applied' => [], 'rejected' => [], 'cursor' => 1]);

    expect(Task::find($task['id']))
        ->text->toBe('Buy milk')
        ->version->toBe(1);
});

test('last write wins: an equal updated_at is applied', function () {
    $task = wireTask();
    push([$task]);

    push([[...$task, 'text' => 'Same instant']])
        ->assertOk()
        ->assertJsonPath('applied', [$task['id']]);

    expect(Task::find($task['id']))->text->toBe('Same instant');
});

test('tombstones round-trip through pull', function () {
    $task = wireTask();
    push([$task]);

    $deleted = [...$task, 'updated_at' => '2026-10-16T00:00:00.000Z', 'deleted_at' => '2026-10-16T00:00:00.000Z'];
    push([$deleted])->assertOk();

    $this->getJson(route('sync.pull', ['cursor' => 1]))
        ->assertOk()
        ->assertExactJson(['tasks' => [$deleted], 'cursor' => 2, 'has_more' => false]);

    expect(Task::count())->toBe(1);
});

test('pull paginates by cursor with has_more', function () {
    $tasks = array_map(fn () => wireTask(), range(1, 5));
    push($tasks);

    $first = $this->getJson(route('sync.pull', ['limit' => 2]))
        ->assertOk()
        ->assertJsonPath('has_more', true)
        ->assertJsonPath('cursor', 2);
    expect(array_column($first->json('tasks'), 'id'))->toBe([$tasks[0]['id'], $tasks[1]['id']]);

    $this->getJson(route('sync.pull', ['cursor' => 2, 'limit' => 2]))
        ->assertJsonPath('has_more', true)
        ->assertJsonPath('cursor', 4);

    $last = $this->getJson(route('sync.pull', ['cursor' => 4, 'limit' => 2]))
        ->assertJsonPath('has_more', false)
        ->assertJsonPath('cursor', 5);
    expect(array_column($last->json('tasks'), 'id'))->toBe([$tasks[4]['id']]);

    $this->getJson(route('sync.pull', ['cursor' => 5]))
        ->assertExactJson(['tasks' => [], 'cursor' => 5, 'has_more' => false]);
});

test('pull returns tasks ordered by version, so an update moves a task to the end', function () {
    [$a, $b] = [wireTask(), wireTask()];
    push([$a, $b]);
    push([[...$a, 'text' => 'Edited']]);

    $response = $this->getJson(route('sync.pull'));

    expect(array_column($response->json('tasks'), 'id'))->toBe([$b['id'], $a['id']]);
    $response->assertJsonPath('cursor', 3);
});

test('a user cannot read another user\'s tasks', function () {
    $other = User::factory()->create();
    $theirs = Task::factory()->for($other)->create(['version' => 1]);

    $this->getJson(route('sync.pull'))
        ->assertExactJson(['tasks' => [], 'cursor' => 0, 'has_more' => false]);

    expect($theirs->exists)->toBeTrue();
});

test('a user cannot overwrite another user\'s task', function () {
    $other = User::factory()->create();
    $theirs = Task::factory()->for($other)->create(['text' => 'Private', 'version' => 1]);
    $mine = wireTask();

    push([wireTask(['id' => $theirs->id, 'text' => 'Hijacked', 'updated_at' => '2099-01-01T00:00:00.000Z']), $mine])
        ->assertOk()
        ->assertJsonPath('applied', [$mine['id']])
        ->assertJsonPath('rejected', [$theirs->id]);

    expect($theirs->fresh())
        ->text->toBe('Private')
        ->user_id->toBe($other->id)
        ->version->toBe(1);
});

test('versions increase strictly across pushes and users', function () {
    $versions = [];

    foreach (range(1, 3) as $i) {
        $task = wireTask();
        push([$task]);
        $versions[] = Task::find($task['id'])->version;
    }

    $this->actingAs(User::factory()->create());
    $task = wireTask();
    push([$task])->assertJsonPath('cursor', 4);
    $versions[] = Task::find($task['id'])->version;

    $this->actingAs($this->user);
    $first = Task::orderBy('version')->first();
    push([[...wireTask(['id' => $first->id]), 'updated_at' => '2026-10-16T00:00:00.000Z']]);
    $versions[] = $first->fresh()->version;

    expect($versions)->toBe([1, 2, 3, 4, 5]);
});

test('push cursor is the highest version owned by the user', function () {
    push([wireTask()]);

    $this->actingAs(User::factory()->create());
    push([wireTask()]);

    $this->actingAs($this->user);
    push([])->assertExactJson(['applied' => [], 'rejected' => [], 'cursor' => 1]);
});

test('guests get 401 json', function () {
    auth()->logout();

    $this->postJson(route('sync.push'), ['tasks' => []])->assertUnauthorized();
    $this->getJson(route('sync.pull'))->assertUnauthorized();

    // Even without an Accept header, sync routes never redirect to the login page.
    $this->post(route('sync.push'), ['tasks' => []])->assertUnauthorized()->assertJson(['message' => 'Unauthenticated.']);
    $this->get(route('sync.pull'))->assertUnauthorized();
});

test('push rejects invalid records with 422', function (array $overrides, string $field) {
    push([wireTask($overrides)])
        ->assertUnprocessable()
        ->assertJsonValidationErrors("tasks.0.{$field}");

    expect(Task::count())->toBe(0);
})->with([
    'unknown color' => [['color' => 'red'], 'color'],
    'bad date' => [['date' => '15/10/2026'], 'date'],
    'someday without column' => [['date' => null, 'someday_column' => null], 'someday_column'],
    'someday column out of range' => [['date' => null, 'someday_column' => 3], 'someday_column'],
    'bad time' => [['time' => '9:30pm'], 'time'],
    'timestamp without milliseconds' => [['updated_at' => '2026-10-15T08:35:00Z'], 'updated_at'],
    'timestamp with offset' => [['created_at' => '2026-10-15T08:35:00.000+02:00'], 'created_at'],
    'non-uuid id' => [['id' => 'not-a-uuid'], 'id'],
    'subtasks not a list' => [['subtasks' => ['a' => ['id' => 's', 'text' => 't', 'done' => false]]], 'subtasks'],
    'subtask missing done' => [['subtasks' => [['id' => 's', 'text' => 't']]], 'subtasks.0.done'],
    'done not boolean' => [['done' => 'yes'], 'done'],
    'missing notes' => [['notes' => null], 'notes'],
]);

test('push rejects more than 500 records', function () {
    push(array_fill(0, 501, wireTask()))
        ->assertUnprocessable()
        ->assertJsonValidationErrors('tasks');
});

test('push requires a tasks list', function () {
    $this->postJson(route('sync.push'), [])->assertUnprocessable()->assertJsonValidationErrors('tasks');
});

test('pull validates cursor and limit', function (array $query, string $field) {
    $this->getJson(route('sync.pull', $query))
        ->assertUnprocessable()
        ->assertJsonValidationErrors($field);
})->with([
    'negative cursor' => [['cursor' => -1], 'cursor'],
    'non-numeric cursor' => [['cursor' => 'abc'], 'cursor'],
    'limit above max' => [['limit' => 1001], 'limit'],
    'zero limit' => [['limit' => 0], 'limit'],
]);

test('deleting a user deletes their tasks', function () {
    push([wireTask()]);

    $this->user->delete();

    expect(Task::count())->toBe(0);
});
