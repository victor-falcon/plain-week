import type { Recurrence, Task } from '@/lib/db/types';
import {
    addDays,
    dayOfMonth,
    daysInMonth,
    isoWeekday,
    maxDateKey,
    minDateKey,
} from './dates';

/**
 * Recurring tasks, as pure functions over rows (see docs/architecture.md):
 * a series row holds the rule, the client generates its occurrences for the
 * dates on screen, and exception rows override single occurrences.
 */

/** A plain task row. */
export type PlainItem = Task & { kind: 'task' };

/** A series row. It is never rendered: its occurrences are. */
export type SeriesItem = Task & {
    kind: 'series';
    date: string;
    recurrence: Recurrence;
};

/** An occurrence generated from a series; it has no row of its own. */
export type OccurrenceItem = Task & {
    kind: 'occurrence';
    seriesId: string;
    /** The generated date, which is also its `date`. */
    occurrenceDate: string;
};

/** An exception row: an occurrence that was changed, moved or deleted. */
export type ExceptionItem = Task & {
    kind: 'exception';
    seriesId: string;
    /** The generated date it replaces (`date` is where it is now). */
    occurrenceDate: string;
};

/** What the planner shows and what the repository accepts as a target. */
export type PlannerTask =
    | PlainItem
    | SeriesItem
    | OccurrenceItem
    | ExceptionItem;

const OCCURRENCE_ID = /^(.+):(\d{4}-\d{2}-\d{2})$/;

/** The deterministic id of a generated occurrence. */
export function occurrenceId(seriesId: string, date: string): string {
    return `${seriesId}:${date}`;
}

/** Splits an occurrence id; null for the id of a row. */
export function parseOccurrenceId(
    id: string,
): { seriesId: string; date: string } | null {
    const match = OCCURRENCE_ID.exec(id);

    return match ? { seriesId: match[1], date: match[2] } : null;
}

/** Wraps a row in its view model. */
export function toItem(task: Task): PlannerTask {
    if (task.recurrence !== null && task.date !== null) {
        return {
            ...task,
            kind: 'series',
            date: task.date,
            recurrence: task.recurrence,
        };
    }

    if (task.series_id !== null && task.occurrence_date !== null) {
        return {
            ...task,
            kind: 'exception',
            seriesId: task.series_id,
            occurrenceDate: task.occurrence_date,
        };
    }

    return { ...task, kind: 'task' };
}

/** Whether `date` matches the rule, ignoring the start and `until`. */
export function matchesRule(recurrence: Recurrence, date: string): boolean {
    if (recurrence.type === 'weekly') {
        return recurrence.weekdays.includes(isoWeekday(date));
    }

    return dayOfMonth(date) === Math.min(recurrence.day, daysInMonth(date));
}

/** Whether the series generates an occurrence on `date`. */
export function occursOn(series: SeriesItem, date: string): boolean {
    const until = series.recurrence.until ?? null;

    return (
        date >= series.date &&
        (until === null || date <= until) &&
        matchesRule(series.recurrence, date)
    );
}

/** The occurrence of `series` on `date` (it does not check `occursOn`). */
export function makeOccurrence(
    series: SeriesItem,
    date: string,
): OccurrenceItem {
    return {
        ...series,
        kind: 'occurrence',
        id: occurrenceId(series.id, date),
        date,
        someday_column: null,
        done: false,
        done_at: null,
        recurrence: null,
        series_id: series.id,
        occurrence_date: date,
        seriesId: series.id,
        occurrenceDate: date,
    };
}

/**
 * What a series contributes to the dates `rangeStart`–`rangeEnd` (inclusive):
 * its generated occurrences, except those an exception row replaces, plus its
 * live exceptions that sit in the range. A deleted exception hides its
 * occurrence. `exceptions` may contain rows of other series; they are ignored.
 * The result is not sorted.
 */
export function expandSeries(
    series: SeriesItem,
    exceptions: Task[],
    rangeStart: string,
    rangeEnd: string,
): Array<OccurrenceItem | ExceptionItem> {
    if (series.deleted_at !== null) {
        return [];
    }

    const own = exceptions.filter((row) => row.series_id === series.id);
    const replaced = new Set(own.map((row) => row.occurrence_date));
    const items: Array<OccurrenceItem | ExceptionItem> = [];
    const first = maxDateKey(series.date, rangeStart);
    const last = minDateKey(series.recurrence.until ?? rangeEnd, rangeEnd);

    for (let date = first; date <= last; date = addDays(date, 1)) {
        if (matchesRule(series.recurrence, date) && !replaced.has(date)) {
            items.push(makeOccurrence(series, date));
        }
    }

    own.forEach((row) => {
        const item = toItem(row);

        if (
            item.kind === 'exception' &&
            item.deleted_at === null &&
            item.date !== null &&
            item.date >= rangeStart &&
            item.date <= rangeEnd
        ) {
            items.push(item);
        }
    });

    return items;
}

/** True for anything that belongs to a series. */
export function isRecurring(item: PlannerTask): boolean {
    return item.kind !== 'task';
}
