import type { IsoWeekday } from '@/lib/db/types';

/**
 * Calendar arithmetic on 'YYYY-MM-DD' keys, done in UTC so that time zones and
 * daylight saving changes can never shift a day. Keys compare correctly as
 * plain strings.
 */

const DAY_MS = 86_400_000;

function toUtcMs(key: string): number {
    const [year, month, day] = key.split('-').map(Number);

    return Date.UTC(year, month - 1, day);
}

function fromUtcMs(ms: number): string {
    const date = new Date(ms);
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');

    return `${date.getUTCFullYear()}-${month}-${day}`;
}

export function addDays(key: string, days: number): string {
    return fromUtcMs(toUtcMs(key) + days * DAY_MS);
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: string, to: string): number {
    return Math.round((toUtcMs(to) - toUtcMs(from)) / DAY_MS);
}

export function isoWeekday(key: string): IsoWeekday {
    return (((new Date(toUtcMs(key)).getUTCDay() + 6) % 7) + 1) as IsoWeekday;
}

/** Day of the month (1–31). */
export function dayOfMonth(key: string): number {
    return Number(key.slice(8, 10));
}

/** Number of days in the month of `key`. */
export function daysInMonth(key: string): number {
    const [year, month] = key.split('-').map(Number);

    return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function maxDateKey(a: string, b: string): string {
    return a > b ? a : b;
}

export function minDateKey(a: string, b: string): string {
    return a < b ? a : b;
}
