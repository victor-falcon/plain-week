import { parseDateKey, toDateKey } from '@/lib/db/dates';
import { addDays } from './week';

function shiftDays(dateKey: string, days: number): string {
    return toDateKey(addDays(parseDateKey(dateKey), days));
}

/**
 * Target day of the "Tomorrow" quick move: the day after the task's date, or
 * the day after today for a Someday task.
 */
export function tomorrowOf(date: string | null, today: string): string {
    return shiftDays(date ?? today, 1);
}

/**
 * Target day of the "Next week" quick move: the same weekday one week after
 * the task's date, or one week from today for a Someday task.
 */
export function nextWeekOf(date: string | null, today: string): string {
    return shiftDays(date ?? today, 7);
}
