import { describe, expect, it } from 'vite-plus/test';
import { toDateKey } from '@/lib/db/dates';
import {
    addWeeks,
    isoWeekNumber,
    parseWeekParam,
    startOfWeek,
    weekColumns,
    weekThursday,
} from './week';

const day = (key: string) => {
    const [year, month, date] = key.split('-').map(Number);

    return new Date(year, month - 1, date);
};

describe('startOfWeek', () => {
    it('returns the Monday of the week', () => {
        expect(toDateKey(startOfWeek(day('2026-10-15')))).toBe('2026-10-12');
        expect(toDateKey(startOfWeek(day('2026-10-12')))).toBe('2026-10-12');
    });

    it('treats Sunday as the last day of the week', () => {
        expect(toDateKey(startOfWeek(day('2026-10-18')))).toBe('2026-10-12');
    });

    it('crosses month and year boundaries', () => {
        expect(toDateKey(startOfWeek(day('2026-01-01')))).toBe('2025-12-29');
    });

    it('ignores the time of day', () => {
        const start = startOfWeek(new Date(2026, 9, 15, 23, 59));

        expect(start.getHours()).toBe(0);
        expect(toDateKey(start)).toBe('2026-10-12');
    });
});

describe('addWeeks', () => {
    it('moves by whole weeks', () => {
        expect(toDateKey(addWeeks(day('2026-10-12'), 1))).toBe('2026-10-19');
        expect(toDateKey(addWeeks(day('2026-10-12'), -2))).toBe('2026-09-28');
    });

    it('keeps local midnight across daylight saving changes', () => {
        // Most European and US zones change clocks in late October.
        const next = addWeeks(day('2026-10-19'), 1);

        expect(next.getHours()).toBe(0);
        expect(toDateKey(next)).toBe('2026-10-26');
    });
});

describe('isoWeekNumber', () => {
    it.each([
        ['2026-10-15', 42],
        ['2026-10-12', 42],
        ['2026-10-18', 42],
        ['2026-01-01', 1],
        ['2025-12-29', 1],
        ['2027-01-03', 53],
        ['2027-01-04', 1],
        ['2020-12-31', 53],
        ['2021-01-03', 53],
        ['2024-12-30', 1],
    ])('%s is in week %i', (date, week) => {
        expect(isoWeekNumber(day(date))).toBe(week);
    });
});

describe('weekThursday', () => {
    it('names the month and year of a week that spans two of them', () => {
        expect(toDateKey(weekThursday(day('2025-12-29')))).toBe('2026-01-01');
        expect(toDateKey(weekThursday(day('2026-09-28')))).toBe('2026-10-01');
    });
});

describe('parseWeekParam', () => {
    it('normalizes any day to its Monday', () => {
        expect(toDateKey(parseWeekParam('2026-10-15')!)).toBe('2026-10-12');
        expect(toDateKey(parseWeekParam('2026-10-12')!)).toBe('2026-10-12');
    });

    it.each([null, '', 'today', '2026-13-01', '2026-02-30', '2026-1-5'])(
        'rejects %s',
        (value) => {
            expect(parseWeekParam(value)).toBeNull();
        },
    );
});

describe('weekColumns', () => {
    it('gives Monday to Friday a column each and stacks the weekend', () => {
        expect(weekColumns(day('2026-10-12'))).toEqual([
            [{ date: '2026-10-12', rows: 10 }],
            [{ date: '2026-10-13', rows: 10 }],
            [{ date: '2026-10-14', rows: 10 }],
            [{ date: '2026-10-15', rows: 10 }],
            [{ date: '2026-10-16', rows: 10 }],
            [
                { date: '2026-10-17', rows: 5 },
                { date: '2026-10-18', rows: 5 },
            ],
        ]);
    });
});
