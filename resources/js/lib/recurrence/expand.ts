import { compareTimestamps } from '@/lib/db/dates';
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

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Validates a rule and puts it in the contract's canonical form (weekdays
 * unique and sorted, `until` only when set), so the server never refuses it.
 * Throws on a rule that is invalid or would never produce an occurrence from
 * `anchorDate` on.
 */
export function normalizeRecurrence(
    recurrence: Recurrence,
    anchorDate: string,
): Recurrence {
    const until = recurrence.until ?? null;

    if (until !== null && (!DATE_KEY.test(until) || until < anchorDate)) {
        throw new Error(`Invalid until date: ${until}.`);
    }

    const end = until === null ? {} : { until };

    if (recurrence.type === 'weekly') {
        const weekdays = [...new Set(recurrence.weekdays)].sort(
            (a, b) => a - b,
        );

        if (
            weekdays.length === 0 ||
            weekdays.some((day) => !Number.isInteger(day) || day < 1 || day > 7)
        ) {
            throw new Error('A weekly rule needs ISO weekdays from 1 to 7.');
        }

        return { type: 'weekly', weekdays, ...end };
    }

    if (
        recurrence.type !== 'monthly' ||
        !Number.isInteger(recurrence.day) ||
        recurrence.day < 1 ||
        recurrence.day > 31
    ) {
        throw new Error('A monthly rule needs a day from 1 to 31.');
    }

    return { type: 'monthly', day: recurrence.day, ...end };
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
 * The exception row that counts for one occurrence. The server does not keep
 * (series_id, occurrence_date) unique, so two offline devices can each write
 * one; the newest `updated_at` wins, then the greater id. A deleted winner
 * hides the occurrence; the losers are never shown.
 */
export function winningException(rows: Task[]): Task | undefined {
    return rows.reduce<Task | undefined>((winner, row) => {
        if (winner === undefined) {
            return row;
        }

        const order = compareTimestamps(row.updated_at, winner.updated_at);

        return order > 0 || (order === 0 && row.id > winner.id) ? row : winner;
    }, undefined);
}

/** The winning exception row of each occurrence date of a series. */
export function winningExceptions(
    seriesId: string,
    exceptions: Task[],
): Map<string, Task> {
    const byDate = new Map<string, Task[]>();

    exceptions.forEach((row) => {
        if (row.series_id === seriesId && row.occurrence_date !== null) {
            byDate.set(row.occurrence_date, [
                ...(byDate.get(row.occurrence_date) ?? []),
                row,
            ]);
        }
    });

    return new Map(
        [...byDate].map(([date, rows]) => [
            date,
            winningException(rows) as Task,
        ]),
    );
}

/**
 * What a series contributes to the dates `rangeStart`–`rangeEnd` (inclusive):
 * its generated occurrences, except those an exception row replaces, plus its
 * live exceptions that sit in the range. A deleted exception hides its
 * occurrence; of duplicate exceptions only the winner counts
 * (`winningException`). `exceptions` may contain rows of other series; they
 * are ignored. The result is not sorted.
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

    const winners = winningExceptions(series.id, exceptions);
    const items: Array<OccurrenceItem | ExceptionItem> = [];
    const first = maxDateKey(series.date, rangeStart);
    const last = minDateKey(series.recurrence.until ?? rangeEnd, rangeEnd);

    for (let date = first; date <= last; date = addDays(date, 1)) {
        if (matchesRule(series.recurrence, date) && !winners.has(date)) {
            items.push(makeOccurrence(series, date));
        }
    }

    winners.forEach((row) => {
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
