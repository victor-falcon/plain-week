import { describe, expect, it } from 'vite-plus/test';
import { makeTask } from '@/test/fixtures';
import {
    asksScope,
    draftToRecurrence,
    repeatDraft,
    rowKey,
    sameRecurrence,
    summarizeRecurrence,
    weekdayName,
} from './repeat';

const TODAY = new Date(2026, 9, 15);

describe('repeatDraft', () => {
    it('starts at "Never" with the anchor weekday and day of the month', () => {
        // 2026-10-14 is a Wednesday.
        expect(repeatDraft('2026-10-14', null)).toEqual({
            kind: 'never',
            weekdays: [3],
            day: 14,
            until: null,
        });
    });

    it('shows the current rule', () => {
        expect(
            repeatDraft('2026-10-14', {
                type: 'weekly',
                weekdays: [1, 3],
                until: '2026-12-31',
            }),
        ).toEqual({
            kind: 'weekly',
            weekdays: [1, 3],
            day: 14,
            until: '2026-12-31',
        });
        expect(repeatDraft('2026-10-31', { type: 'monthly', day: 31 })).toEqual(
            { kind: 'monthly', weekdays: [6], day: 31, until: null },
        );
    });
});

describe('draftToRecurrence', () => {
    it('builds the rule with sorted weekdays and the end date', () => {
        expect(
            draftToRecurrence({
                kind: 'weekly',
                weekdays: [5, 1, 3],
                day: 1,
                until: '2026-12-31',
            }),
        ).toEqual({ type: 'weekly', weekdays: [1, 3, 5], until: '2026-12-31' });
        expect(
            draftToRecurrence({
                kind: 'monthly',
                weekdays: [1],
                day: 31,
                until: null,
            }),
        ).toEqual({ type: 'monthly', day: 31 });
        expect(
            draftToRecurrence({
                kind: 'never',
                weekdays: [1],
                day: 1,
                until: null,
            }),
        ).toBeNull();
    });
});

describe('sameRecurrence', () => {
    it('ignores weekday order and compares the end date', () => {
        expect(
            sameRecurrence(
                { type: 'weekly', weekdays: [3, 1] },
                { type: 'weekly', weekdays: [1, 3], until: null },
            ),
        ).toBe(true);
        expect(
            sameRecurrence(
                { type: 'monthly', day: 3 },
                { type: 'monthly', day: 3, until: '2026-12-31' },
            ),
        ).toBe(false);
        expect(sameRecurrence(null, { type: 'monthly', day: 3 })).toBe(false);
        expect(sameRecurrence(null, null)).toBe(true);
    });
});

describe('summarizeRecurrence', () => {
    it('lists weekdays from Monday', () => {
        expect(
            summarizeRecurrence({ type: 'weekly', weekdays: [7, 3, 1] }, TODAY),
        ).toBe('Every Mon, Wed, Sun');
        expect(
            summarizeRecurrence(
                { type: 'weekly', weekdays: [1, 2, 3, 4, 5, 6, 7] },
                TODAY,
            ),
        ).toBe('Every day');
    });

    it('describes monthly rules and the end date', () => {
        expect(summarizeRecurrence({ type: 'monthly', day: 31 }, TODAY)).toBe(
            'Monthly on day 31',
        );
        expect(
            summarizeRecurrence(
                { type: 'monthly', day: 1, until: '2026-12-31' },
                TODAY,
            ),
        ).toBe('Monthly on day 1, until 31 Dec');
    });
});

describe('weekdayName', () => {
    it('names ISO weekdays', () => {
        expect(weekdayName(1)).toBe('Mon');
        expect(weekdayName(7, 'long')).toBe('Sunday');
    });
});

describe('asksScope and rowKey', () => {
    const base = { ...makeTask(), seriesId: 's', occurrenceDate: '2026-10-14' };

    it('asks for occurrences and for exceptions of a live series', () => {
        expect(asksScope({ ...base, kind: 'occurrence' }, undefined)).toBe(
            true,
        );
        expect(asksScope({ ...base, kind: 'exception' }, null)).toBe(false);
        expect(asksScope({ ...makeTask(), kind: 'task' }, null)).toBe(false);
    });

    it('keys an occurrence and its exception alike', () => {
        expect(
            rowKey({ ...base, id: 's:2026-10-14', kind: 'occurrence' }),
        ).toBe(rowKey({ ...base, id: 'row', kind: 'exception' }));
        expect(rowKey({ ...makeTask(), id: 'plain', kind: 'task' })).toBe(
            'plain',
        );
    });
});
