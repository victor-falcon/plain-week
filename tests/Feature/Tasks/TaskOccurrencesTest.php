<?php

use App\Enums\TaskColor;
use App\Models\Task;
use App\Models\User;
use App\Tasks\Occurrence;
use App\Tasks\TaskOccurrences;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;

// The cases mirror resources/js/lib/recurrence/expand.test.ts, so client and server expand series the same way.

uses(RefreshDatabase::class);

const WEEKLY_MWF = ['type' => 'weekly', 'weekdays' => [1, 3, 5]];

beforeEach(function () {
    $this->user = User::factory()->create();
});

/**
 * A series row anchored on Monday 2026-10-12, like the client tests.
 *
 * @param  array<string, mixed>  $recurrence
 * @param  array<string, mixed>  $overrides
 */
function occurrenceSeries(array $recurrence, array $overrides = []): Task
{
    return Task::factory()->for(test()->user)->create([
        'id' => 'series',
        'text' => 'Gym',
        'date' => '2026-10-12',
        'recurrence' => $recurrence,
        ...$overrides,
    ]);
}

/**
 * An exception row of `series` for the occurrence on `$occurrenceDate`.
 *
 * @param  array<string, mixed>  $overrides
 */
function occurrenceException(string $occurrenceDate, array $overrides = []): Task
{
    return Task::factory()->for(test()->user)->create([
        'id' => "exception-{$occurrenceDate}",
        'date' => $occurrenceDate,
        'series_id' => 'series',
        'occurrence_date' => $occurrenceDate,
        'updated_at' => '2026-10-13T10:00:00.000Z',
        ...$overrides,
    ]);
}

/**
 * @return list<Occurrence>
 */
function occurrencesOn(string $from, string $to, ?User $user = null): array
{
    return app(TaskOccurrences::class)
        ->forUser($user ?? test()->user, CarbonImmutable::parse($from), CarbonImmutable::parse($to))
        ->all();
}

/**
 * @return list<string>
 */
function occurrenceDates(string $from, string $to): array
{
    return array_map(fn (Occurrence $item) => $item->date, occurrencesOn($from, $to));
}

describe('matchesRule', function () {
    it('counts a daily rule from its anchor, never before it', function () {
        $every21 = ['type' => 'daily', 'every' => 21];

        expect(TaskOccurrences::matchesRule($every21, '2026-10-12', '2026-10-12'))->toBeTrue()
            ->and(TaskOccurrences::matchesRule($every21, '2026-10-12', '2026-11-02'))->toBeTrue()
            ->and(TaskOccurrences::matchesRule($every21, '2026-10-12', '2026-11-23'))->toBeTrue()
            ->and(TaskOccurrences::matchesRule($every21, '2026-10-12', '2026-11-01'))->toBeFalse()
            ->and(TaskOccurrences::matchesRule($every21, '2026-10-12', '2026-09-21'))->toBeFalse()
            ->and(TaskOccurrences::matchesRule(['type' => 'daily', 'every' => 1], '2026-10-12', '2026-10-13'))->toBeTrue();
    });

    it('clamps a monthly day to the last day of shorter months', function () {
        $on31 = ['type' => 'monthly', 'day' => 31];

        expect(TaskOccurrences::matchesRule($on31, '2026-01-01', '2026-01-31'))->toBeTrue()
            ->and(TaskOccurrences::matchesRule($on31, '2026-01-01', '2026-02-28'))->toBeTrue()
            ->and(TaskOccurrences::matchesRule($on31, '2026-01-01', '2026-02-27'))->toBeFalse()
            ->and(TaskOccurrences::matchesRule($on31, '2026-01-01', '2026-04-30'))->toBeTrue()
            ->and(TaskOccurrences::matchesRule($on31, '2026-01-01', '2028-02-28'))->toBeFalse()
            ->and(TaskOccurrences::matchesRule($on31, '2026-01-01', '2028-02-29'))->toBeTrue()
            ->and(TaskOccurrences::matchesRule(['type' => 'monthly', 'day' => 29], '2026-01-01', '2026-02-28'))->toBeTrue()
            ->and(TaskOccurrences::matchesRule(['type' => 'monthly', 'day' => 29], '2026-01-01', '2026-03-28'))->toBeFalse();
    });

    it('matches ISO weekdays, Sunday included', function () {
        $sundays = ['type' => 'weekly', 'weekdays' => [7]];

        expect(TaskOccurrences::matchesRule($sundays, '2026-10-12', '2026-10-18'))->toBeTrue()
            ->and(TaskOccurrences::matchesRule($sundays, '2026-10-12', '2026-10-19'))->toBeFalse()
            ->and(TaskOccurrences::matchesRule(WEEKLY_MWF, '2026-10-12', '2026-10-14'))->toBeTrue();
    });

    it('matches nothing for an unknown rule type, like the client', function () {
        expect(TaskOccurrences::matchesRule(['type' => 'yearly'], '2026-10-12', '2026-10-12'))->toBeFalse();
    });
});

describe('series expansion', function () {
    it('generates weekly occurrences on several weekdays', function () {
        occurrenceSeries(WEEKLY_MWF, ['time' => '07:30', 'notes' => 'Legs', 'color' => TaskColor::Mango]);

        $items = occurrencesOn('2026-10-12', '2026-10-25');

        expect(array_map(fn (Occurrence $item) => $item->date, $items))->toBe([
            '2026-10-12', '2026-10-14', '2026-10-16', '2026-10-19', '2026-10-21', '2026-10-23',
        ])
            ->and($items[0])->toEqual(new Occurrence(
                id: 'series:2026-10-12',
                taskId: 'series',
                seriesId: 'series',
                occurrenceDate: '2026-10-12',
                date: '2026-10-12',
                time: '07:30',
                text: 'Gym',
                notes: 'Legs',
                done: false,
                color: TaskColor::Mango,
                position: 'a0',
            ))
            ->and($items[0]->isGenerated())->toBeTrue();
    });

    it('handles Sunday and a range across a year boundary', function () {
        occurrenceSeries(['type' => 'weekly', 'weekdays' => [7]], ['date' => '2026-12-01']);

        expect(occurrenceDates('2026-12-28', '2027-01-10'))->toBe(['2027-01-03', '2027-01-10']);
    });

    it('starts at the series date, not before', function () {
        occurrenceSeries(WEEKLY_MWF, ['date' => '2026-10-14']);

        expect(occurrenceDates('2026-10-12', '2026-10-18'))->toBe(['2026-10-14', '2026-10-16']);
    });

    it('starts on the series date even when it does not match', function () {
        occurrenceSeries(WEEKLY_MWF, ['date' => '2026-10-13']);

        expect(occurrenceDates('2026-10-12', '2026-10-18'))->toBe(['2026-10-14', '2026-10-16']);
    });

    it('stops at until, inclusive', function () {
        occurrenceSeries([...WEEKLY_MWF, 'until' => '2026-10-16']);

        expect(occurrenceDates('2026-10-12', '2026-10-25'))->toBe(['2026-10-12', '2026-10-14', '2026-10-16']);
    });

    it('skips a series that ended before the range', function () {
        occurrenceSeries([...WEEKLY_MWF, 'until' => '2026-10-11'], ['date' => '2026-10-01']);

        expect(occurrencesOn('2026-10-12', '2026-10-18'))->toBe([]);
    });

    it('generates monthly occurrences with the last-day clamp', function () {
        occurrenceSeries(['type' => 'monthly', 'day' => 31], ['date' => '2026-01-31']);

        expect(occurrenceDates('2026-01-01', '2026-06-30'))->toBe([
            '2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31', '2026-06-30',
        ]);
    });

    it('generates daily occurrences every N days from the anchor', function () {
        occurrenceSeries(['type' => 'daily', 'every' => 21]);

        expect(occurrenceDates('2026-10-01', '2027-01-31'))->toBe([
            '2026-10-12', '2026-11-02', '2026-11-23', '2026-12-14', '2027-01-04', '2027-01-25',
        ])
            // A week in the middle of the gap shows nothing.
            ->and(occurrenceDates('2026-10-19', '2026-10-25'))->toBe([]);
    });

    it('stops a daily rule at until', function () {
        occurrenceSeries(['type' => 'daily', 'every' => 2, 'until' => '2026-10-17']);

        expect(occurrenceDates('2026-10-12', '2026-10-18'))->toBe(['2026-10-12', '2026-10-14', '2026-10-16']);
    });

    it('keeps the daily cadence across DST changes and leap days', function () {
        occurrenceSeries(['type' => 'daily', 'every' => 7], ['date' => '2028-02-22']);

        expect(occurrenceDates('2028-02-01', '2028-04-10'))->toBe([
            '2028-02-22', '2028-02-29', '2028-03-07', '2028-03-14', '2028-03-21', '2028-03-28', '2028-04-04',
        ]);
    });

    it('keeps the daily cadence when the app runs in a time zone with DST', function () {
        config(['app.timezone' => 'Europe/Madrid']);
        date_default_timezone_set('Europe/Madrid');

        try {
            occurrenceSeries(['type' => 'daily', 'every' => 1], ['date' => '2026-03-28']);

            expect(occurrenceDates('2026-03-28', '2026-03-30'))->toBe(['2026-03-28', '2026-03-29', '2026-03-30']);
        } finally {
            date_default_timezone_set('UTC');
        }
    });

    it('lands on 29 February in a leap year', function () {
        occurrenceSeries(['type' => 'monthly', 'day' => 30], ['date' => '2028-01-01']);

        expect(occurrenceDates('2028-02-01', '2028-03-31'))->toBe(['2028-02-29', '2028-03-30']);
    });

    it('ignores deleted series', function () {
        occurrenceSeries(WEEKLY_MWF, ['deleted_at' => '2026-10-13T00:00:00.000Z']);

        expect(occurrencesOn('2026-10-12', '2026-10-18'))->toBe([]);
    });
});

describe('exceptions', function () {
    it('lets an exception replace a daily occurrence', function () {
        occurrenceSeries(['type' => 'daily', 'every' => 21]);
        occurrenceException('2026-11-02', ['date' => '2026-11-04']);

        $items = occurrencesOn('2026-11-02', '2026-11-08');

        expect(array_map(fn (Occurrence $item) => [$item->id, $item->date], $items))
            ->toBe([['exception-2026-11-02', '2026-11-04']]);
    });

    it('lets an exception replace its occurrence, wherever it moved', function () {
        occurrenceSeries(WEEKLY_MWF);
        occurrenceException('2026-10-14', ['date' => '2026-10-15', 'text' => 'Gym (moved)', 'done' => true]);
        occurrenceException('2026-10-16', ['date' => '2026-11-02']);

        $items = occurrencesOn('2026-10-12', '2026-10-18');

        expect(array_map(fn (Occurrence $item) => [$item->id, $item->date], $items))->toBe([
            ['series:2026-10-12', '2026-10-12'],
            ['exception-2026-10-14', '2026-10-15'],
        ])
            ->and($items[1])->toHaveProperties([
                'taskId' => 'exception-2026-10-14',
                'seriesId' => 'series',
                'occurrenceDate' => '2026-10-14',
                'text' => 'Gym (moved)',
                'done' => true,
            ])
            ->and($items[1]->isGenerated())->toBeFalse();
    });

    it('shows an exception moved into the range from an occurrence outside it', function () {
        occurrenceSeries(WEEKLY_MWF);
        occurrenceException('2026-10-16', ['date' => '2026-11-03']);

        expect(array_map(fn (Occurrence $item) => $item->id, occurrencesOn('2026-11-03', '2026-11-03')))
            ->toBe(['exception-2026-10-16']);
    });

    it('hides the occurrence of a deleted exception', function () {
        occurrenceSeries(WEEKLY_MWF);
        occurrenceException('2026-10-14', ['deleted_at' => '2026-10-13T00:00:00.000Z']);

        expect(occurrenceDates('2026-10-12', '2026-10-18'))->toBe(['2026-10-12', '2026-10-16']);
    });

    it('ignores exceptions of other series', function () {
        occurrenceSeries(WEEKLY_MWF);
        occurrenceException('2026-10-14', ['series_id' => 'other']);

        expect(array_map(fn (Occurrence $item) => $item->id, occurrencesOn('2026-10-12', '2026-10-18')))->toBe([
            'series:2026-10-12',
            'exception-2026-10-14',
            'series:2026-10-14',
            'series:2026-10-16',
        ]);
    });

    it('shows an exception whose series is gone as a task', function () {
        occurrenceSeries(WEEKLY_MWF, ['deleted_at' => '2026-10-13T00:00:00.000Z']);
        occurrenceException('2026-10-14');

        expect(array_map(fn (Occurrence $item) => $item->id, occurrencesOn('2026-10-12', '2026-10-18')))
            ->toBe(['exception-2026-10-14']);
    });
});

it('ignores rows passed as exceptions that are not exception rows', function () {
    $series = occurrenceSeries(WEEKLY_MWF);
    $notAnException = occurrenceException('2026-10-14', ['recurrence' => WEEKLY_MWF]);

    expect(array_map(
        fn (Occurrence $item) => $item->id,
        TaskOccurrences::expandSeries($series, [$notAnException], '2026-10-12', '2026-10-18'),
    ))->toBe(['series:2026-10-12', 'series:2026-10-14', 'series:2026-10-16']);
});

describe('duplicate exceptions', function () {
    beforeEach(function () {
        occurrenceSeries(WEEKLY_MWF);
        $this->older = occurrenceException('2026-10-14', ['id' => 'a', 'text' => 'older', 'updated_at' => '2026-10-13T10:00:00.000Z']);
        $this->newer = occurrenceException('2026-10-14', [
            'id' => 'b',
            'text' => 'newer',
            'date' => '2026-10-15',
            'updated_at' => '2026-10-13T11:00:00.000Z',
        ]);
    });

    it('shows only the newest one', function () {
        expect(array_map(fn (Occurrence $item) => $item->text, occurrencesOn('2026-10-12', '2026-10-18')))
            ->toBe(['Gym', 'newer', 'Gym'])
            ->and(TaskOccurrences::winningException([$this->older, $this->newer])?->id)->toBe('b');
    });

    it('hides the loser even when only the loser is in the range', function () {
        expect(occurrenceDates('2026-10-14', '2026-10-14'))->toBe([]);
    });

    it('breaks a timestamp tie by id', function () {
        $this->newer->update(['updated_at' => '2026-10-13T10:00:00.000Z']);

        expect(TaskOccurrences::winningException([$this->newer, $this->older])?->id)->toBe('b')
            ->and(TaskOccurrences::winningException([$this->older, $this->newer])?->id)->toBe('b');
    });

    it('hides the occurrence when the winner is deleted', function () {
        $this->newer->update(['deleted_at' => '2026-10-13T11:00:00.000Z']);

        expect(occurrenceDates('2026-10-12', '2026-10-18'))->toBe(['2026-10-12', '2026-10-16']);
    });
});

describe('forUser', function () {
    it('lists plain tasks in the range, in planner order', function () {
        $task = fn (array $attributes) => Task::factory()->for($this->user)->create($attributes);
        $task(['id' => 'late', 'date' => '2026-10-13', 'time' => '18:00']);
        $task(['id' => 'early', 'date' => '2026-10-13', 'time' => '09:00']);
        $task(['id' => 'b-untimed', 'date' => '2026-10-13', 'position' => 'a1']);
        $task(['id' => 'a-untimed', 'date' => '2026-10-13', 'position' => 'a2']);
        $task(['id' => 'first', 'date' => '2026-10-12', 'position' => 'a5', 'done' => true]);
        $task(['id' => 'outside', 'date' => '2026-10-19']);
        $task(['id' => 'deleted', 'date' => '2026-10-13', 'deleted_at' => '2026-10-13T00:00:00.000Z']);
        Task::factory()->for($this->user)->someday()->create(['id' => 'someday']);
        Task::factory()->create(['id' => 'someone-else', 'date' => '2026-10-13']);

        $items = occurrencesOn('2026-10-12', '2026-10-18');

        expect(array_map(fn (Occurrence $item) => $item->id, $items))
            ->toBe(['first', 'early', 'late', 'b-untimed', 'a-untimed'])
            ->and($items[0])->toHaveProperties(['taskId' => 'first', 'seriesId' => null, 'occurrenceDate' => null, 'done' => true])
            ->and($items[0]->isGenerated())->toBeFalse();
    });

    it('never returns series rows or the series of another user', function () {
        occurrenceSeries(WEEKLY_MWF);
        Task::factory()->create(['id' => 'their-series', 'date' => '2026-10-12', 'recurrence' => WEEKLY_MWF]);

        expect(array_map(fn (Occurrence $item) => $item->taskId, occurrencesOn('2026-10-12', '2026-10-12')))
            ->toBe(['series']);
    });

    it('takes the dates of the given moments, whatever their time', function () {
        occurrenceSeries(['type' => 'daily', 'every' => 1]);

        expect(array_map(
            fn (Occurrence $item) => $item->date,
            app(TaskOccurrences::class)->forUser(
                $this->user,
                CarbonImmutable::parse('2026-10-13 23:59'),
                CarbonImmutable::parse('2026-10-14 00:00'),
            )->all(),
        ))->toBe(['2026-10-13', '2026-10-14']);
    });

    it('is empty for a backwards range', function () {
        occurrenceSeries(WEEKLY_MWF);

        expect(occurrencesOn('2026-10-18', '2026-10-12'))->toBe([]);
    });
});
