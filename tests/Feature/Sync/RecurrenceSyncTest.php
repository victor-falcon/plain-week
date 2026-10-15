<?php

use App\Models\Task;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;

uses(RefreshDatabase::class);

beforeEach(function () {
    $this->user = User::factory()->create();
    $this->actingAs($this->user);
});

/**
 * @param  array<string, mixed>  $overrides
 * @return array<string, mixed>
 */
function wireSeries(array $overrides = []): array
{
    return wireTask(['recurrence' => ['type' => 'weekly', 'weekdays' => [1, 3, 5]], ...$overrides]);
}

/**
 * @param  array<string, mixed>  $series
 * @param  array<string, mixed>  $overrides
 * @return array<string, mixed>
 */
function wireException(array $series, array $overrides = []): array
{
    return wireTask(['series_id' => $series['id'], 'occurrence_date' => '2026-10-16', ...$overrides]);
}

test('series and exception rows round-trip through push and pull', function () {
    $weekly = wireSeries(['time' => '07:00']);
    $monthly = wireSeries(['recurrence' => ['type' => 'monthly', 'day' => 31, 'until' => '2027-03-31']]);
    $moved = wireException($weekly, ['date' => '2026-10-17', 'done' => true, 'done_at' => '2026-10-17T09:00:00.000Z']);
    $toSomeday = wireException($monthly, ['date' => null, 'someday_column' => 1, 'occurrence_date' => '2026-10-31']);

    push([$weekly, $monthly, $moved, $toSomeday])
        ->assertOk()
        ->assertJsonPath('applied', [$weekly['id'], $monthly['id'], $moved['id'], $toSomeday['id']]);

    $this->getJson(route('sync.pull'))
        ->assertOk()
        ->assertExactJson(['tasks' => [$weekly, $monthly, $moved, $toSomeday], 'cursor' => 4, 'has_more' => false]);

    expect(Task::find($weekly['id'])->recurrence)->toBe(['type' => 'weekly', 'weekdays' => [1, 3, 5]]);
});

test('plain tasks return null recurrence fields', function () {
    $task = wireTask();
    push([$task]);

    $this->getJson(route('sync.pull'))
        ->assertJsonPath('tasks.0.recurrence', null)
        ->assertJsonPath('tasks.0.series_id', null)
        ->assertJsonPath('tasks.0.occurrence_date', null);
});

test('records without the recurrence keys (clients before v0.0.2) are accepted and keep stored values', function () {
    $series = wireSeries();
    push([$series]);

    $legacy = $series;
    unset($legacy['recurrence'], $legacy['series_id'], $legacy['occurrence_date']);
    push([[...$legacy, 'text' => 'Renamed', 'updated_at' => '2026-10-16T00:00:00.000Z']])
        ->assertOk()
        ->assertJsonPath('applied', [$series['id']]);

    $new = wireTask();
    unset($new['recurrence'], $new['series_id'], $new['occurrence_date']);
    push([$new])->assertOk();

    expect(Task::find($series['id']))
        ->text->toBe('Renamed')
        ->recurrence->toBe($series['recurrence'])
        ->and(Task::find($new['id']))
        ->recurrence->toBeNull()
        ->series_id->toBeNull();
});

test('an exception is accepted before its series arrives', function () {
    $series = wireSeries();
    $exception = wireException($series);

    push([$exception])->assertOk()->assertJsonPath('applied', [$exception['id']]);
    push([$series])->assertOk()->assertJsonPath('applied', [$series['id']]);

    expect(Task::where('series_id', $series['id'])->pluck('id')->all())->toBe([$exception['id']]);
});

test('a series can be ended with until and a plain task can become a series', function () {
    $task = wireTask();
    push([$task]);

    $series = [...$task, 'recurrence' => ['type' => 'weekly', 'weekdays' => [4]], 'updated_at' => '2026-10-16T00:00:00.000Z'];
    push([$series])->assertOk()->assertJsonPath('applied', [$task['id']]);

    $ended = [...$series, 'recurrence' => [...$series['recurrence'], 'until' => '2026-10-15'], 'updated_at' => '2026-10-17T00:00:00.000Z'];
    push([$ended])->assertOk()->assertJsonPath('applied', [$task['id']]);

    $this->getJson(route('sync.pull', ['cursor' => 2]))->assertExactJson(['tasks' => [$ended], 'cursor' => 3, 'has_more' => false]);
});

test('last write wins also covers the recurrence fields', function () {
    $series = wireSeries(['updated_at' => '2026-10-15T10:00:00.500Z']);
    push([$series]);

    push([[...$series, 'recurrence' => ['type' => 'monthly', 'day' => 1], 'updated_at' => '2026-10-15T10:00:00.499Z']])
        ->assertOk()
        ->assertExactJson(['applied' => [], 'rejected' => [], 'cursor' => 1]);

    expect(Task::find($series['id'])->recurrence)->toBe($series['recurrence']);
});

test('a series and its exceptions can be tombstoned', function () {
    $series = wireSeries();
    $exception = wireException($series);
    push([$series, $exception]);

    $deletedAt = '2026-10-18T00:00:00.000Z';
    $tombstones = [
        // Deleting "this and all future" from the first day may also end the series before its start date.
        [...$series, 'recurrence' => [...$series['recurrence'], 'until' => '2026-10-14'], 'updated_at' => $deletedAt, 'deleted_at' => $deletedAt],
        [...$exception, 'updated_at' => $deletedAt, 'deleted_at' => $deletedAt],
    ];

    push($tombstones)->assertOk()->assertJsonPath('applied', [$series['id'], $exception['id']]);

    $this->getJson(route('sync.pull', ['cursor' => 2]))
        ->assertExactJson(['tasks' => $tombstones, 'cursor' => 4, 'has_more' => false]);
});

test('tombstones skip the row-kind invariants', function () {
    $deletedAt = '2026-10-18T00:00:00.000Z';
    $orphan = wireTask(['occurrence_date' => '2026-10-16', 'updated_at' => $deletedAt, 'deleted_at' => $deletedAt]);

    push([$orphan])->assertOk()->assertJsonPath('applied', [$orphan['id']]);
});

test('series_id never exposes another user\'s rows', function () {
    $other = User::factory()->create();
    $theirs = Task::factory()->for($other)->create([
        'recurrence' => ['type' => 'weekly', 'weekdays' => [1]],
        'text' => 'Private',
        'version' => 1,
    ]);

    $mine = wireTask(['series_id' => $theirs->id, 'occurrence_date' => '2026-10-19']);
    push([$mine])->assertOk()->assertJsonPath('applied', [$mine['id']]);

    $this->getJson(route('sync.pull'))
        ->assertExactJson(['tasks' => [$mine], 'cursor' => 1, 'has_more' => false]);

    expect($theirs->fresh())->text->toBe('Private')->version->toBe(1);
});

test('push rejects invalid recurrence fields with 422', function (array $overrides, string $field) {
    push([wireTask($overrides)])
        ->assertUnprocessable()
        ->assertJsonValidationErrors("tasks.0.{$field}");

    expect(Task::count())->toBe(0);
})->with([
    'unknown type' => [['recurrence' => ['type' => 'daily']], 'recurrence.type'],
    'missing type' => [['recurrence' => ['weekdays' => [1]]], 'recurrence.type'],
    'unknown key' => [['recurrence' => ['type' => 'monthly', 'day' => 1, 'every' => 2]], 'recurrence'],
    'recurrence not an object' => [['recurrence' => 'weekly'], 'recurrence'],
    'weekly without weekdays' => [['recurrence' => ['type' => 'weekly']], 'recurrence.weekdays'],
    'weekly with empty weekdays' => [['recurrence' => ['type' => 'weekly', 'weekdays' => []]], 'recurrence.weekdays'],
    'weekday zero' => [['recurrence' => ['type' => 'weekly', 'weekdays' => [0]]], 'recurrence.weekdays.0'],
    'weekday eight' => [['recurrence' => ['type' => 'weekly', 'weekdays' => [1, 8]]], 'recurrence.weekdays.1'],
    'weekday as string' => [['recurrence' => ['type' => 'weekly', 'weekdays' => ['1']]], 'recurrence.weekdays.0'],
    'duplicate weekdays' => [['recurrence' => ['type' => 'weekly', 'weekdays' => [2, 2]]], 'recurrence.weekdays'],
    'unsorted weekdays' => [['recurrence' => ['type' => 'weekly', 'weekdays' => [5, 1]]], 'recurrence.weekdays'],
    'weekly with day' => [['recurrence' => ['type' => 'weekly', 'weekdays' => [1], 'day' => 3]], 'recurrence.day'],
    'monthly without day' => [['recurrence' => ['type' => 'monthly']], 'recurrence.day'],
    'monthly day zero' => [['recurrence' => ['type' => 'monthly', 'day' => 0]], 'recurrence.day'],
    'monthly day 32' => [['recurrence' => ['type' => 'monthly', 'day' => 32]], 'recurrence.day'],
    'monthly with weekdays' => [['recurrence' => ['type' => 'monthly', 'day' => 1, 'weekdays' => [1]]], 'recurrence.weekdays'],
    'bad until' => [['recurrence' => ['type' => 'monthly', 'day' => 1, 'until' => '31/12/2026']], 'recurrence.until'],
    'until before date' => [['recurrence' => ['type' => 'monthly', 'day' => 1, 'until' => '2026-10-14']], 'recurrence.until'],
    'non-uuid series_id' => [['series_id' => 'abc', 'occurrence_date' => '2026-10-15'], 'series_id'],
    'bad occurrence_date' => [['series_id' => (string) Str::uuid7(), 'occurrence_date' => '2026/10/15'], 'occurrence_date'],
]);

test('push enforces the row kinds', function (Closure $build, string $field) {
    push([$build()])
        ->assertUnprocessable()
        ->assertJsonValidationErrors("tasks.0.{$field}");

    expect(Task::count())->toBe(0);
})->with([
    'series without a date' => [fn () => wireSeries(['date' => null, 'someday_column' => 0]), 'date'],
    'series with series_id' => [fn () => wireSeries(['series_id' => (string) Str::uuid7()]), 'series_id'],
    'series with occurrence_date' => [fn () => wireSeries(['occurrence_date' => '2026-10-15']), 'occurrence_date'],
    'exception without occurrence_date' => [fn () => wireTask(['series_id' => (string) Str::uuid7()]), 'occurrence_date'],
    'exception without series_id' => [fn () => wireTask(['occurrence_date' => '2026-10-15']), 'series_id'],
    'exception of itself' => [function () {
        $id = (string) Str::uuid7();

        return wireTask(['id' => $id, 'series_id' => $id, 'occurrence_date' => '2026-10-15']);
    }, 'series_id'],
]);
