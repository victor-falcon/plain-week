import { compareTaskOrder } from './position';
import type { Task } from './types';

/**
 * Whether "Move unfinished tasks to today" moves `task`: a live, unfinished,
 * dated task from before `today`. Someday tasks have no date to fall behind.
 * Recurring tasks stay where they are: a series row only anchors its rule,
 * and an occurrence (or its exception row) belongs to its date; the series
 * shows up again on its next date anyway, so carrying would duplicate it.
 */
export function isCarriedOver(task: Task, today: string): boolean {
    return (
        task.deleted_at === null &&
        !task.done &&
        task.date !== null &&
        task.date < today &&
        task.recurrence === null &&
        task.series_id === null
    );
}

/** Oldest day first, then the order each day had (position). */
export function compareCarryOverOrder(a: Task, b: Task): number {
    if (a.date !== b.date) {
        return (a.date ?? '') < (b.date ?? '') ? -1 : 1;
    }

    return compareTaskOrder(a, b);
}
