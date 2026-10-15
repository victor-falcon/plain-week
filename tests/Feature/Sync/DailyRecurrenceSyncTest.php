<?php

use App\Http\Requests\Sync\SyncFormat;
use App\Models\Task;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;

uses(RefreshDatabase::class);

beforeEach(function () {
    $this->user = User::factory()->create();
    $this->actingAs($this->user);
});

/**
 * @param  array<string, mixed>  $overrides
 * @return array<string, mixed>
 */
function wireDailySeries(array $overrides = []): array
{
    return wireTask(['recurrence' => ['type' => 'daily', 'every' => 21], ...$overrides]);
}

/**
 * Pulls like the current client; a null format sends no `X-Sync-Format` header, like v0.0.3 and older.
 *
 * @param  array<string, int>  $query
 */
function pull(array $query = [], ?int $format = SyncFormat::DAILY_RULES): TestResponse
{
    $headers = $format === null ? [] : [SyncFormat::HEADER => (string) $format];

    return test()->getJson(route('sync.pull', $query), $headers);
}

test('a daily series and its exceptions round-trip through push and pull', function () {
    $series = wireDailySeries(['recurrence' => ['type' => 'daily', 'every' => 21, 'until' => '2027-10-15']]);
    $moved = wireTask(['series_id' => $series['id'], 'occurrence_date' => '2026-11-05', 'date' => '2026-11-06']);

    push([$series, $moved])->assertOk()->assertJsonPath('applied', [$series['id'], $moved['id']]);

    pull()->assertOk()->assertExactJson(['tasks' => [$series, $moved], 'cursor' => 2, 'has_more' => false]);

    expect(Task::find($series['id'])->recurrence)->toBe(['type' => 'daily', 'every' => 21, 'until' => '2027-10-15']);
});

test('every can be changed and the series ended', function () {
    $series = wireDailySeries();
    push([$series]);

    $changed = [...$series, 'recurrence' => ['type' => 'daily', 'every' => 1, 'until' => '2026-12-31'], 'updated_at' => '2026-10-16T00:00:00.000Z'];
    push([$changed])->assertOk()->assertJsonPath('applied', [$series['id']]);

    expect(Task::find($series['id'])->recurrence)->toBe($changed['recurrence']);
});

test('clients without the header (v0.0.3) never pull a daily series', function () {
    $daily = wireDailySeries();
    $exception = wireTask(['series_id' => $daily['id'], 'occurrence_date' => '2026-11-05']);
    $weekly = wireTask(['recurrence' => ['type' => 'weekly', 'weekdays' => [1]]]);
    $plain = wireTask();
    push([$daily, $exception, $weekly, $plain]);

    pull([], null)->assertExactJson(['tasks' => [$exception, $weekly, $plain], 'cursor' => 4, 'has_more' => false]);
    pull(['limit' => 1], null)->assertExactJson(['tasks' => [$exception], 'cursor' => 2, 'has_more' => true]);
    pull([], SyncFormat::LEGACY)->assertJsonCount(3, 'tasks');

    // Its tombstone is not sent either.
    $deletedAt = '2026-10-18T00:00:00.000Z';
    push([[...$daily, 'updated_at' => $deletedAt, 'deleted_at' => $deletedAt]]);
    pull(['cursor' => 4], null)->assertExactJson(['tasks' => [], 'cursor' => 4, 'has_more' => false]);

    pull()->assertJsonCount(4, 'tasks');
});

test('a malformed header counts as a legacy client', function (string $header) {
    push([wireDailySeries()]);

    $this->getJson(route('sync.pull'), [SyncFormat::HEADER => $header])->assertJsonCount(0, 'tasks');
})->with(['', 'two', '-2', '1']);

test('a newer format still gets daily series', function () {
    push([wireDailySeries()]);

    pull([], 3)->assertJsonCount(1, 'tasks');
});

test('clients without the header (v0.0.3) cannot change a stored daily series', function () {
    $series = wireDailySeries();
    $exception = wireTask(['series_id' => $series['id'], 'occurrence_date' => '2026-11-05']);
    push([$series, $exception]);

    $later = '2026-10-16T00:00:00.000Z';
    $asWeekly = [...$series, 'recurrence' => ['type' => 'weekly', 'weekdays' => [4]], 'updated_at' => $later];
    $deleted = [...$series, 'updated_at' => $later, 'deleted_at' => $later];
    $renamedException = [...$exception, 'text' => 'Renamed', 'updated_at' => $later];

    push([$asWeekly, $deleted, $renamedException], null)
        ->assertOk()
        ->assertJsonPath('applied', [$exception['id']])
        ->assertJsonPath('rejected', [$series['id']]);

    expect(Task::find($series['id']))->recurrence->toBe($series['recurrence'])->deleted_at->toBeNull()
        ->and(Task::find($exception['id']))->text->toBe('Renamed');

    push([$asWeekly])->assertOk()->assertJsonPath('applied', [$series['id']]);
});
