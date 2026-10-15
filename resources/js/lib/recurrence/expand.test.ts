import { describe, expect, it } from 'vite-plus/test';
import type { Recurrence, Task } from '@/lib/db/types';
import { makeTask } from '@/test/fixtures';
import { addDays, daysInMonth, isoWeekday } from './dates';
import {
    expandSeries,
    isRecurring,
    matchesRule,
    occurrenceId,
    parseOccurrenceId,
    toItem,
} from './expand';
import type { SeriesItem } from './expand';

function series(
    recurrence: Recurrence,
    overrides: Partial<Task> = {},
): SeriesItem {
    const item = toItem(
        makeTask({
            id: 'series',
            text: 'Gym',
            date: '2026-10-12',
            recurrence,
            ...overrides,
        }),
    );

    if (item.kind !== 'series') {
        throw new Error('Not a series.');
    }

    return item;
}

function exception(occurrenceDate: string, overrides: Partial<Task> = {}) {
    return makeTask({
        id: `exception-${occurrenceDate}`,
        date: occurrenceDate,
        series_id: 'series',
        occurrence_date: occurrenceDate,
        ...overrides,
    });
}

function dates(items: Array<{ date: string | null }>) {
    return items
        .map((item) => item.date ?? '')
        .sort((a, b) => a.localeCompare(b));
}

const WEEKDAYS: Recurrence = { type: 'weekly', weekdays: [1, 3, 5] };

describe('dates', () => {
    it('adds days across months, years and DST changes', () => {
        expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
        expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
        expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
        expect(addDays('2028-03-01', -1)).toBe('2028-02-29');
        // Europe and the US change clocks on these dates.
        expect(addDays('2026-03-28', 2)).toBe('2026-03-30');
        expect(addDays('2026-10-24', 2)).toBe('2026-10-26');
        expect(addDays('2026-11-01', 1)).toBe('2026-11-02');
    });

    it('gives ISO weekdays', () => {
        expect(isoWeekday('2026-10-12')).toBe(1);
        expect(isoWeekday('2026-10-17')).toBe(6);
        expect(isoWeekday('2026-10-18')).toBe(7);
    });

    it('counts the days of a month, leap years included', () => {
        expect(daysInMonth('2026-02-10')).toBe(28);
        expect(daysInMonth('2028-02-10')).toBe(29);
        expect(daysInMonth('2100-02-10')).toBe(28);
        expect(daysInMonth('2000-02-10')).toBe(29);
        expect(daysInMonth('2026-04-01')).toBe(30);
        expect(daysInMonth('2026-12-01')).toBe(31);
    });
});

describe('occurrence ids', () => {
    it('round-trips', () => {
        const id = occurrenceId(
            '0190a3c4-1234-7abc-8def-0123456789ab',
            '2026-10-12',
        );

        expect(parseOccurrenceId(id)).toEqual({
            seriesId: '0190a3c4-1234-7abc-8def-0123456789ab',
            date: '2026-10-12',
        });
        expect(
            parseOccurrenceId('0190a3c4-1234-7abc-8def-0123456789ab'),
        ).toBeNull();
    });
});

describe('matchesRule', () => {
    it('clamps a monthly day to the last day of shorter months', () => {
        const on31: Recurrence = { type: 'monthly', day: 31 };

        expect(matchesRule(on31, '2026-01-31')).toBe(true);
        expect(matchesRule(on31, '2026-02-28')).toBe(true);
        expect(matchesRule(on31, '2026-02-27')).toBe(false);
        expect(matchesRule(on31, '2026-04-30')).toBe(true);
        expect(matchesRule(on31, '2028-02-28')).toBe(false);
        expect(matchesRule(on31, '2028-02-29')).toBe(true);
        expect(matchesRule({ type: 'monthly', day: 29 }, '2026-02-28')).toBe(
            true,
        );
        expect(matchesRule({ type: 'monthly', day: 29 }, '2028-02-28')).toBe(
            false,
        );
        expect(matchesRule({ type: 'monthly', day: 30 }, '2026-03-30')).toBe(
            true,
        );
        expect(matchesRule({ type: 'monthly', day: 30 }, '2026-03-31')).toBe(
            false,
        );
    });
});

describe('expandSeries', () => {
    it('generates weekly occurrences on several weekdays', () => {
        const items = expandSeries(
            series(WEEKDAYS),
            [],
            '2026-10-12',
            '2026-10-25',
        );

        expect(dates(items)).toEqual([
            '2026-10-12',
            '2026-10-14',
            '2026-10-16',
            '2026-10-19',
            '2026-10-21',
            '2026-10-23',
        ]);
        expect(items[0]).toMatchObject({
            kind: 'occurrence',
            id: 'series:2026-10-12',
            seriesId: 'series',
            occurrenceDate: '2026-10-12',
            series_id: 'series',
            occurrence_date: '2026-10-12',
            recurrence: null,
            text: 'Gym',
            done: false,
        });
    });

    it('handles Sunday and a range across a year boundary', () => {
        const items = expandSeries(
            series({ type: 'weekly', weekdays: [7] }, { date: '2026-12-01' }),
            [],
            '2026-12-28',
            '2027-01-10',
        );

        expect(dates(items)).toEqual(['2027-01-03', '2027-01-10']);
    });

    it('starts at the series date, not before', () => {
        const items = expandSeries(
            series(WEEKDAYS, { date: '2026-10-14' }),
            [],
            '2026-10-12',
            '2026-10-18',
        );

        expect(dates(items)).toEqual(['2026-10-14', '2026-10-16']);
    });

    it('starts on the series date even when it does not match', () => {
        const items = expandSeries(
            series(WEEKDAYS, { date: '2026-10-13' }),
            [],
            '2026-10-12',
            '2026-10-18',
        );

        expect(dates(items)).toEqual(['2026-10-14', '2026-10-16']);
    });

    it('stops at until, inclusive', () => {
        const items = expandSeries(
            series({ ...WEEKDAYS, until: '2026-10-16' }),
            [],
            '2026-10-12',
            '2026-10-25',
        );

        expect(dates(items)).toEqual([
            '2026-10-12',
            '2026-10-14',
            '2026-10-16',
        ]);
        expect(
            expandSeries(
                series({ ...WEEKDAYS, until: '2026-10-11' }),
                [],
                '2026-10-12',
                '2026-10-18',
            ),
        ).toEqual([]);
    });

    it('generates monthly occurrences with the last-day clamp', () => {
        const items = expandSeries(
            series({ type: 'monthly', day: 31 }, { date: '2026-01-31' }),
            [],
            '2026-01-01',
            '2026-06-30',
        );

        expect(dates(items)).toEqual([
            '2026-01-31',
            '2026-02-28',
            '2026-03-31',
            '2026-04-30',
            '2026-05-31',
            '2026-06-30',
        ]);
    });

    it('lands on 29 February in a leap year', () => {
        const items = expandSeries(
            series({ type: 'monthly', day: 30 }, { date: '2028-01-01' }),
            [],
            '2028-02-01',
            '2028-03-31',
        );

        expect(dates(items)).toEqual(['2028-02-29', '2028-03-30']);
    });

    it('lets an exception replace its occurrence, wherever it moved', () => {
        const moved = exception('2026-10-14', {
            date: '2026-10-15',
            text: 'Gym (moved)',
        });
        const elsewhere = exception('2026-10-16', { date: '2026-11-02' });
        const items = expandSeries(
            series(WEEKDAYS),
            [moved, elsewhere],
            '2026-10-12',
            '2026-10-18',
        );

        expect(items.map((item) => [item.kind, item.date])).toEqual([
            ['occurrence', '2026-10-12'],
            ['exception', '2026-10-15'],
        ]);
        expect(items[1]).toMatchObject({
            id: moved.id,
            seriesId: 'series',
            occurrenceDate: '2026-10-14',
            text: 'Gym (moved)',
        });
    });

    it('hides the occurrence of a deleted exception', () => {
        const items = expandSeries(
            series(WEEKDAYS),
            [exception('2026-10-14', { deleted_at: '2026-10-13T00:00:00Z' })],
            '2026-10-12',
            '2026-10-18',
        );

        expect(dates(items)).toEqual(['2026-10-12', '2026-10-16']);
    });

    it('ignores exceptions of other series and deleted series', () => {
        const other = exception('2026-10-14', { series_id: 'other' });

        expect(
            dates(
                expandSeries(
                    series(WEEKDAYS),
                    [other],
                    '2026-10-12',
                    '2026-10-18',
                ),
            ),
        ).toEqual(['2026-10-12', '2026-10-14', '2026-10-16']);
        expect(
            expandSeries(
                series(WEEKDAYS, { deleted_at: '2026-10-13T00:00:00Z' }),
                [],
                '2026-10-12',
                '2026-10-18',
            ),
        ).toEqual([]);
    });
});

describe('view model', () => {
    it('tells the kinds of rows apart', () => {
        expect(toItem(makeTask()).kind).toBe('task');
        expect(toItem(exception('2026-10-12')).kind).toBe('exception');
        expect(series(WEEKDAYS).kind).toBe('series');
        expect(isRecurring(toItem(makeTask()))).toBe(false);
        expect(isRecurring(toItem(exception('2026-10-12')))).toBe(true);
    });
});
