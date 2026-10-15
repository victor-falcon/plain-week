import {
    expandSeries,
    makeOccurrence,
    occursOn,
    parseOccurrenceId,
    toItem,
} from '@/lib/recurrence/expand';
import type { PlannerTask, SeriesItem } from '@/lib/recurrence/expand';
import { db } from './database';
import { parseDateKey, weekDateKeys } from './dates';
import { compareDayOrder, compareTaskOrder } from './position';
import { SOMEDAY_COLUMNS } from './types';
import type { SomedayColumn, Task } from './types';

/** Where a task lives: a day, or a Someday column. */
export type TaskPlacement =
    | { date: string; someday_column?: null }
    | { date: null; someday_column: SomedayColumn };

/** Tasks per day of the week, keyed by 'YYYY-MM-DD' (every day is present). */
export type WeekTasks = Record<string, PlannerTask[]>;

/** The three Someday columns, each sorted. */
export type SomedayTasks = [PlannerTask[], PlannerTask[], PlannerTask[]];

export function placementOf(task: Task): TaskPlacement {
    return task.date === null
        ? { date: null, someday_column: task.someday_column ?? 0 }
        : { date: task.date };
}

function isLive(task: Task): boolean {
    return task.deleted_at === null;
}

/** Live series rows that can generate an occurrence in the range. */
async function querySeriesInRange(
    rangeStart: string,
    rangeEnd: string,
): Promise<SeriesItem[]> {
    const rows = await db.tasks
        .where('recurrence.type')
        .anyOf(['weekly', 'monthly'])
        .toArray();

    return rows
        .filter(isLive)
        .map(toItem)
        .filter(
            (item): item is SeriesItem =>
                item.kind === 'series' &&
                item.date <= rangeEnd &&
                (item.recurrence.until ?? rangeStart) >= rangeStart,
        );
}

/** Every exception row (deleted too) of a series for the given dates. */
export function queryExceptions(
    seriesId: string,
    fromDate: string,
    toDate: string,
): Promise<Task[]> {
    return db.tasks
        .where('[series_id+occurrence_date]')
        .between([seriesId, fromDate], [seriesId, toDate], true, true)
        .toArray();
}

/**
 * Live items dated `rangeStart`–`rangeEnd` (inclusive), unsorted: plain
 * tasks, exceptions and the occurrences series generate there. Series rows
 * themselves are left out.
 */
export async function queryRangeItems(
    rangeStart: string,
    rangeEnd: string,
): Promise<PlannerTask[]> {
    const [rows, series] = await Promise.all([
        db.tasks
            .where('date')
            .between(rangeStart, rangeEnd, true, true)
            .toArray(),
        querySeriesInRange(rangeStart, rangeEnd),
    ]);
    const items = new Map<string, PlannerTask>();

    rows.filter(isLive)
        .map(toItem)
        .filter((item) => item.kind !== 'series')
        .forEach((item) => items.set(item.id, item));

    const generated = await Promise.all(
        series.map(async (item) =>
            expandSeries(
                item,
                await queryExceptions(item.id, rangeStart, rangeEnd),
                rangeStart,
                rangeEnd,
            ),
        ),
    );

    generated.flat().forEach((item) => items.set(item.id, item));

    return [...items.values()];
}

/** Live items of one day or Someday column, by position. */
export async function queryListTasks(
    placement: TaskPlacement,
): Promise<PlannerTask[]> {
    const items =
        placement.date !== null
            ? await queryRangeItems(placement.date, placement.date)
            : (
                  await db.tasks
                      .where('someday_column')
                      .equals(placement.someday_column)
                      .filter((task) => task.date === null && isLive(task))
                      .toArray()
              ).map(toItem);

    return items.sort(compareTaskOrder);
}

/**
 * Live items of the seven days starting at `firstDay`, occurrences of series
 * included, grouped and in display order: timed tasks first by time, then the
 * rest by position.
 */
export async function queryWeekTasks(firstDay: string): Promise<WeekTasks> {
    const days = weekDateKeys(parseDateKey(firstDay));
    const items = await queryRangeItems(days[0], days[6]);

    return Object.fromEntries(
        days.map((day) => [
            day,
            items.filter((item) => item.date === day).sort(compareDayOrder),
        ]),
    );
}

/** Live tasks of the three Someday columns, each sorted. */
export async function querySomedayTasks(): Promise<SomedayTasks> {
    const tasks = await db.tasks
        .where('someday_column')
        .anyOf([...SOMEDAY_COLUMNS])
        .filter((task) => task.date === null && isLive(task))
        .toArray();
    const inColumn = (column: SomedayColumn) =>
        tasks
            .filter((task) => task.someday_column === column)
            .sort(compareTaskOrder)
            .map(toItem);

    return [inColumn(0), inColumn(1), inColumn(2)];
}

/** A live series, or null. */
export async function querySeries(id: string): Promise<SeriesItem | null> {
    const row = await db.tasks.get(id);
    const item = row && isLive(row) ? toItem(row) : null;

    return item?.kind === 'series' ? item : null;
}

/**
 * A live item by id, or null when it does not exist or was deleted. The id
 * may be a row id or an occurrence id (`${seriesId}:${date}`); an occurrence
 * that has an exception row resolves to that row, so an id taken from the
 * screen keeps working after its first change.
 */
export async function queryTask(id: string): Promise<PlannerTask | null> {
    const occurrence = parseOccurrenceId(id);

    if (occurrence === null) {
        const row = await db.tasks.get(id);

        return row && isLive(row) ? toItem(row) : null;
    }

    const series = await querySeries(occurrence.seriesId);

    if (series === null) {
        return null;
    }

    const [exception] = await queryExceptions(
        series.id,
        occurrence.date,
        occurrence.date,
    );

    if (exception) {
        return isLive(exception) ? toItem(exception) : null;
    }

    return occursOn(series, occurrence.date)
        ? makeOccurrence(series, occurrence.date)
        : null;
}

/** The series an occurrence or exception belongs to (a series: itself). */
export function getSeries(item: PlannerTask): Promise<SeriesItem | null> {
    if (item.kind === 'task') {
        return Promise.resolve(null);
    }

    return querySeries(item.kind === 'series' ? item.id : item.seriesId);
}

/**
 * Number of local changes not yet accepted by the server. For guests it is
 * the work that only lives on this device.
 */
export function queryPendingChangeCount(): Promise<number> {
    return db.outbox.count();
}
