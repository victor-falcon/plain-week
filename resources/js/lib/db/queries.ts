import { db } from './database';
import { parseDateKey, weekDateKeys } from './dates';
import { compareTaskOrder } from './position';
import { SOMEDAY_COLUMNS } from './types';
import type { Task } from './types';

/** Tasks per day of the week, keyed by 'YYYY-MM-DD' (every day is present). */
export type WeekTasks = Record<string, Task[]>;

/** The three Someday columns, each sorted. */
export type SomedayTasks = [Task[], Task[], Task[]];

/** Sorted, non-deleted tasks of the seven days starting at `firstDay`. */
export async function queryWeekTasks(firstDay: string): Promise<WeekTasks> {
    const days = weekDateKeys(parseDateKey(firstDay));
    const tasks = await db.tasks
        .where('date')
        .between(days[0], days[6], true, true)
        .filter((task) => task.deleted_at === null)
        .toArray();
    const week: WeekTasks = Object.fromEntries(days.map((day) => [day, []]));

    tasks.forEach((task) => week[task.date as string]?.push(task));
    Object.values(week).forEach((list) => list.sort(compareTaskOrder));

    return week;
}

/** Sorted, non-deleted tasks of the three Someday columns. */
export async function querySomedayTasks(): Promise<SomedayTasks> {
    const tasks = await db.tasks
        .where('someday_column')
        .anyOf([...SOMEDAY_COLUMNS])
        .filter((task) => task.date === null && task.deleted_at === null)
        .toArray();
    const columns: SomedayTasks = [[], [], []];

    tasks.forEach((task) => columns[task.someday_column ?? 0].push(task));
    columns.forEach((list) => list.sort(compareTaskOrder));

    return columns;
}

/** A non-deleted task, or null. */
export async function queryTask(id: string): Promise<Task | null> {
    const task = await db.tasks.get(id);

    return task && task.deleted_at === null ? task : null;
}
