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
export type WeekTasks = Record<string, Task[]>;

/** The three Someday columns, each sorted. */
export type SomedayTasks = [Task[], Task[], Task[]];

export function placementOf(task: Task): TaskPlacement {
    return task.date === null
        ? { date: null, someday_column: task.someday_column ?? 0 }
        : { date: task.date };
}

function isLive(task: Task): boolean {
    return task.deleted_at === null;
}

/** Sorts live tasks by position, dropping tombstones. */
function ordered(
    tasks: Task[],
    compare: (a: Task, b: Task) => number = compareTaskOrder,
): Task[] {
    return tasks.filter(isLive).sort(compare);
}

/** Live tasks of one day or Someday column, in display order. */
export async function queryListTasks(
    placement: TaskPlacement,
): Promise<Task[]> {
    const tasks =
        placement.date !== null
            ? await db.tasks.where('date').equals(placement.date).toArray()
            : await db.tasks
                  .where('someday_column')
                  .equals(placement.someday_column)
                  .filter((task) => task.date === null)
                  .toArray();

    return ordered(tasks);
}

/**
 * Live tasks of the seven days starting at `firstDay`, grouped and in display
 * order: timed tasks first by time, then the rest by position.
 */
export async function queryWeekTasks(firstDay: string): Promise<WeekTasks> {
    const days = weekDateKeys(parseDateKey(firstDay));
    const tasks = await db.tasks
        .where('date')
        .between(days[0], days[6], true, true)
        .toArray();

    return Object.fromEntries(
        days.map((day) => [
            day,
            ordered(
                tasks.filter((t) => t.date === day),
                compareDayOrder,
            ),
        ]),
    );
}

/** Live tasks of the three Someday columns, each sorted. */
export async function querySomedayTasks(): Promise<SomedayTasks> {
    const tasks = await db.tasks
        .where('someday_column')
        .anyOf([...SOMEDAY_COLUMNS])
        .filter((task) => task.date === null)
        .toArray();
    const inColumn = (column: SomedayColumn) =>
        ordered(tasks.filter((task) => task.someday_column === column));

    return [inColumn(0), inColumn(1), inColumn(2)];
}

/** A live task, or null when it does not exist or was deleted. */
export async function queryTask(id: string): Promise<Task | null> {
    const task = await db.tasks.get(id);

    return task && isLive(task) ? task : null;
}

/**
 * Number of local changes not yet accepted by the server. For guests it is
 * the work that only lives on this device.
 */
export function queryPendingChangeCount(): Promise<number> {
    return db.outbox.count();
}
