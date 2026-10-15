<?php

use App\Http\Requests\Sync\SyncFormat;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

/*
|--------------------------------------------------------------------------
| Test Case
|--------------------------------------------------------------------------
|
| The closure you provide to your test functions is always bound to a specific PHPUnit test
| case class. By default, that class is "PHPUnit\Framework\TestCase". Of course, you may
| need to change it using the "pest()" function to bind different classes or traits.
|
*/

pest()->extend(TestCase::class)
 // ->use(RefreshDatabase::class)
    ->in('Feature');

/*
|--------------------------------------------------------------------------
| Expectations
|--------------------------------------------------------------------------
|
| When you're writing tests, you often need to check that values meet certain conditions. The
| "expect()" function gives you access to a set of "expectations" methods that you can use
| to assert different things. Of course, you may extend the Expectation API at any time.
|
*/

expect()->extend('toBeOne', function () {
    return $this->toBe(1);
});

/*
|--------------------------------------------------------------------------
| Functions
|--------------------------------------------------------------------------
|
| While Pest is very powerful out-of-the-box, you may have some testing code specific to your
| project that you don't want to repeat in every file. Here you can also expose helpers as
| global functions to help you to reduce the number of lines of code in your test files.
|
*/

function something()
{
    // ..
}

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
        'recurrence' => null,
        'series_id' => null,
        'occurrence_date' => null,
        'created_at' => '2026-10-15T08:35:00.123Z',
        'updated_at' => '2026-10-15T08:35:00.123Z',
        'deleted_at' => null,
    ], $overrides);
}

/**
 * Pushes like the current client; a null format sends no `X-Sync-Format` header, like v0.0.3 and older.
 *
 * @param  list<array<string, mixed>>  $tasks
 */
function push(array $tasks, ?int $format = SyncFormat::DAILY_RULES): TestResponse
{
    $headers = $format === null ? [] : [SyncFormat::HEADER => (string) $format];

    return test()->postJson(route('sync.push'), ['tasks' => $tasks], $headers);
}
