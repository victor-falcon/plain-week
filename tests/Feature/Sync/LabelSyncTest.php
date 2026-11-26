<?php

use App\Actions\Sync\SyncFormat;
use App\Enums\TaskColor;
use App\Models\TaskLabel;
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
function wireLabel(array $overrides = []): array
{
    return array_merge([
        'color' => 'pink',
        'name' => 'Deep work',
        'updated_at' => '2026-11-26T10:00:00.000Z',
    ], $overrides);
}

/**
 * Pushes tasks and labels like a client that syncs labels (format 3).
 *
 * @param  list<array<string, mixed>>  $labels
 * @param  list<array<string, mixed>>  $tasks
 */
function pushLabels(array $labels, array $tasks = []): TestResponse
{
    return test()->postJson(
        route('sync.push'),
        ['tasks' => $tasks, 'labels' => $labels],
        [SyncFormat::HEADER => (string) SyncFormat::Labels->value],
    );
}

/**
 * @param  array<string, int>  $query
 */
function pullLabels(array $query = [], SyncFormat $format = SyncFormat::Labels): TestResponse
{
    return test()->getJson(route('sync.pull', $query), [SyncFormat::HEADER => (string) $format->value]);
}

test('push stores a label and pull returns it', function () {
    $label = wireLabel();

    pushLabels([$label])
        ->assertOk()
        ->assertExactJson(['applied' => [], 'rejected' => [], 'cursor' => 1]);

    pullLabels()
        ->assertOk()
        ->assertExactJson(['tasks' => [], 'labels' => [$label], 'cursor' => 1, 'has_more' => false]);

    expect(TaskLabel::sole())
        ->user_id->toBe($this->user->id)
        ->color->toBe(TaskColor::Pink);
});

test('a name is stored trimmed and an empty one means the default name', function () {
    pushLabels([wireLabel(['name' => '  Errands  ']), wireLabel(['color' => 'green', 'name' => ''])])->assertOk();

    expect(pullLabels()->json('labels'))->toBe([
        wireLabel(['name' => 'Errands']),
        wireLabel(['color' => 'green', 'name' => '']),
    ]);
});

test('labels use last-write-wins per color', function () {
    pushLabels([wireLabel()]);

    pushLabels([wireLabel(['name' => 'Stale', 'updated_at' => '2026-11-26T09:59:59.999Z'])])->assertOk();
    expect(TaskLabel::sole())->name->toBe('Deep work')->version->toBe(1);

    pushLabels([wireLabel(['name' => 'Same instant'])])->assertOk();
    expect(TaskLabel::sole())->name->toBe('Same instant');

    pushLabels([wireLabel(['name' => '', 'updated_at' => '2026-11-26T11:00:00.000Z'])])->assertOk();
    expect(TaskLabel::sole())->name->toBe('');
});

test('labels and tasks share one version sequence and paginate together', function () {
    $first = wireTask();
    $second = wireTask();
    pushLabels([wireLabel()], [$first]);
    pushLabels([wireLabel(['color' => 'lilac', 'name' => 'Home'])], [$second]);

    // Versions: task 1, pink 2, task 3, lilac 4.
    pullLabels(['limit' => 3])
        ->assertJsonPath('tasks', [$first, $second])
        ->assertJsonPath('labels', [wireLabel()])
        ->assertJsonPath('cursor', 3)
        ->assertJsonPath('has_more', true);

    pullLabels(['cursor' => 3])
        ->assertExactJson([
            'tasks' => [],
            'labels' => [wireLabel(['color' => 'lilac', 'name' => 'Home'])],
            'cursor' => 4,
            'has_more' => false,
        ]);

    pushLabels([wireLabel(['color' => 'mango', 'name' => 'Work'])])->assertJsonPath('cursor', 5);
});

test('clients before format 3 get no labels and keep their old response shape', function (?SyncFormat $format) {
    $task = wireTask();
    pushLabels([wireLabel()], [$task]);

    $headers = $format === null ? [] : [SyncFormat::HEADER => (string) $format->value];

    test()->getJson(route('sync.pull'), $headers)
        ->assertExactJson(['tasks' => [$task], 'cursor' => 1, 'has_more' => false]);
})->with([
    'no header' => [null],
    'daily rules' => [SyncFormat::DailyRules],
]);

test('a push without labels still works, as from older clients', function () {
    push([wireTask()])->assertOk()->assertJsonPath('cursor', 1);

    expect(TaskLabel::count())->toBe(0);
});

test('a newer format than the server knows gets labels', function () {
    pushLabels([wireLabel()]);

    $this->getJson(route('sync.pull'), [SyncFormat::HEADER => '9'])->assertJsonPath('labels', [wireLabel()]);
});

test('a user never sees or changes another user\'s labels', function () {
    $other = User::factory()->create();
    pushLabels([wireLabel()]);

    $this->actingAs($other);
    pullLabels()->assertJsonPath('labels', []);
    pushLabels([wireLabel(['name' => 'Mine', 'updated_at' => '2026-11-27T00:00:00.000Z'])])->assertOk();

    expect(TaskLabel::query()->where('user_id', $this->user->id)->sole()->name)->toBe('Deep work')
        ->and(TaskLabel::query()->where('user_id', $other->id)->sole()->name)->toBe('Mine');
});

test('push rejects invalid labels with 422', function (array $labels, string $field) {
    pushLabels($labels)->assertUnprocessable()->assertJsonValidationErrors($field);

    expect(TaskLabel::count())->toBe(0);
})->with([
    'color none' => [[wireLabel(['color' => 'none'])], 'labels.0.color'],
    'unknown color' => [[wireLabel(['color' => 'teal'])], 'labels.0.color'],
    'duplicate color' => [[wireLabel(), wireLabel()], 'labels.0.color'],
    'name too long' => [[wireLabel(['name' => str_repeat('a', 25)])], 'labels.0.name'],
    'name not a string' => [[wireLabel(['name' => null])], 'labels.0.name'],
    'missing name' => [[['color' => 'pink', 'updated_at' => '2026-11-26T10:00:00.000Z']], 'labels.0.name'],
    'bad timestamp' => [[wireLabel(['updated_at' => '2026-11-26 10:00:00'])], 'labels.0.updated_at'],
    'unknown key' => [[wireLabel(['deleted_at' => null])], 'labels.0'],
    'not a list' => [['pink' => wireLabel()], 'labels'],
    'too many' => [array_fill(0, 9, wireLabel()), 'labels'],
]);

test('a name of 24 characters after trimming is accepted', function () {
    pushLabels([wireLabel(['name' => '  '.str_repeat('é', 24).'  '])])->assertOk();

    expect(TaskLabel::sole()->name)->toBe(str_repeat('é', 24));
});

test('deleting a user deletes their labels', function () {
    pushLabels([wireLabel()]);

    $this->user->delete();

    expect(TaskLabel::count())->toBe(0);
});
