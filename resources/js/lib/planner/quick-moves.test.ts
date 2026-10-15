import { describe, expect, it } from 'vite-plus/test';
import { nextWeekOf, tomorrowOf } from './quick-moves';

const TODAY = '2026-10-15';

describe('quick moves', () => {
    it('moves a dated task relative to its own date', () => {
        expect(tomorrowOf('2026-10-31', TODAY)).toBe('2026-11-01');
        expect(nextWeekOf('2026-12-28', TODAY)).toBe('2027-01-04');
    });

    it('moves a Someday task relative to today', () => {
        expect(tomorrowOf(null, TODAY)).toBe('2026-10-16');
        expect(nextWeekOf(null, TODAY)).toBe('2026-10-22');
    });
});
