import { describe, expect, it } from 'vite-plus/test';
import { formatLongDate, formatShortDate } from '@/lib/planner/format';

describe('date labels', () => {
    it('formats the long date', () => {
        expect(formatLongDate('2026-10-12')).toBe('Mon, 12 Oct 2026');
    });

    it('keeps the short date to day and month in the current year', () => {
        const today = new Date(2026, 9, 15);

        expect(formatShortDate('2026-10-12', today)).toBe('12 Oct');
        expect(formatShortDate('2027-01-04', today)).toBe('4 Jan 2027');
    });
});
