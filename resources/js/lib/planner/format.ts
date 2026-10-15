import { parseDateKey } from '@/lib/db/dates';

/** The UI is English only for now; dates read "12 Oct", "October 2026". */
const LOCALE = 'en-GB';

const dayFormat = new Intl.DateTimeFormat(LOCALE, {
    day: 'numeric',
    month: 'short',
});
const weekdayFormat = new Intl.DateTimeFormat(LOCALE, { weekday: 'short' });
const longMonthFormat = new Intl.DateTimeFormat(LOCALE, {
    month: 'long',
    year: 'numeric',
});
const shortMonthFormat = new Intl.DateTimeFormat(LOCALE, {
    month: 'short',
    year: 'numeric',
});

/** "12 Oct" for a 'YYYY-MM-DD' key. */
export function formatDay(dateKey: string): string {
    return dayFormat.format(parseDateKey(dateKey));
}

/** "Mon" for a 'YYYY-MM-DD' key. */
export function formatWeekday(dateKey: string): string {
    return weekdayFormat.format(parseDateKey(dateKey));
}

/** "October 2026" (long) or "Oct 2026" (short). */
export function formatMonthTitle(date: Date, style: 'long' | 'short'): string {
    return (style === 'long' ? longMonthFormat : shortMonthFormat).format(date);
}

/** "W42". */
export function formatWeekNumber(week: number): string {
    return `W${String(week).padStart(2, '0')}`;
}
