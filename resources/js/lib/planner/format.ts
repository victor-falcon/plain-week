import { parseDateKey } from '@/lib/db/dates';
import { currentLocale, intlLocale, t } from '@/lib/i18n';

/**
 * The `Intl` locale for dates: the active language, with English shown the
 * British way ("12 Oct", "Mon, 12 Oct 2026", weeks start on Monday).
 */
export function dateLocale(): string {
    return currentLocale() === 'en' ? 'en-GB' : intlLocale();
}

const formatters = new Map<string, Intl.DateTimeFormat>();

/** A cached `Intl.DateTimeFormat` for the active locale. */
export function dateFormat(
    options: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormat {
    const locale = dateLocale();
    const key = `${locale}|${JSON.stringify(options)}`;
    let format = formatters.get(key);

    if (!format) {
        format = new Intl.DateTimeFormat(locale, options);
        formatters.set(key, format);
    }

    return format;
}

const DAY: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' };
const WEEKDAY: Intl.DateTimeFormatOptions = { weekday: 'short' };
const YEAR: Intl.DateTimeFormatOptions = { year: 'numeric' };

/** "12 Oct" for a 'YYYY-MM-DD' key. */
export function formatDay(dateKey: string): string {
    return dateFormat(DAY).format(parseDateKey(dateKey));
}

/** "Mon" for a 'YYYY-MM-DD' key. */
export function formatWeekday(dateKey: string): string {
    return dateFormat(WEEKDAY).format(parseDateKey(dateKey));
}

/** "Mon, 12 Oct 2026" for a 'YYYY-MM-DD' key. */
export function formatLongDate(dateKey: string): string {
    const date = parseDateKey(dateKey);

    if (currentLocale() !== 'en') {
        return dateFormat({ ...WEEKDAY, ...DAY, ...YEAR }).format(date);
    }

    return `${dateFormat(WEEKDAY).format(date)}, ${dateFormat(DAY).format(date)} ${dateFormat(YEAR).format(date)}`;
}

/**
 * "12 Oct" for a 'YYYY-MM-DD' key in the current year, "12 Oct 2027"
 * otherwise.
 */
export function formatShortDate(dateKey: string, today = new Date()): string {
    const date = parseDateKey(dateKey);

    return date.getFullYear() === today.getFullYear()
        ? dateFormat(DAY).format(date)
        : dateFormat({ ...DAY, ...YEAR }).format(date);
}

/** "October 2026" (long) or "Oct 2026" (short). */
export function formatMonthTitle(date: Date, style: 'long' | 'short'): string {
    return dateFormat({ month: style, year: 'numeric' }).format(date);
}

/** "W42". */
export function formatWeekNumber(week: number): string {
    return t('planner.weekNumber', { week: String(week).padStart(2, '0') });
}
