import { toast } from 'sonner';
import { toDateKey } from '@/lib/db/dates';
import {
    deleteTask,
    duplicateTask,
    moveTask,
    restoreTask,
    updateTask,
} from '@/lib/db/tasks';
import { SOMEDAY_COLUMNS } from '@/lib/db/types';
import type { Task, TaskColor } from '@/lib/db/types';
import { nextWeekOf, tomorrowOf } from './quick-moves';
import { saveLocally } from './save-locally';

/**
 * The task actions shared by the task dialog and the task context menu. They
 * write to the local database without making the UI wait, and report a failed
 * write with a toast.
 */

export function setTaskColor(task: Task, color: TaskColor): void {
    if (color !== task.color) {
        saveLocally(updateTask(task.id, { color }));
    }
}

/**
 * Quick moves. "Today" is read when the action runs, so a planner left open
 * overnight counts from the right day.
 */
export function moveToTomorrow(task: Task): void {
    saveLocally(
        moveTask(task.id, {
            date: tomorrowOf(task.date, toDateKey(new Date())),
        }),
    );
}

export function moveToNextWeek(task: Task): void {
    saveLocally(
        moveTask(task.id, {
            date: nextWeekOf(task.date, toDateKey(new Date())),
        }),
    );
}

export function moveToSomeday(task: Task): void {
    saveLocally(
        moveTask(task.id, { date: null, someday_column: SOMEDAY_COLUMNS[0] }),
    );
}

export function duplicateWithToast(task: Task): void {
    saveLocally(duplicateTask(task.id), {
        error: 'Could not duplicate the task.',
        onSaved: () => toast.success('Task duplicated.'),
    });
}

/**
 * Deletes at once (no confirmation) and offers "Undo" in a toast, which
 * restores the same task. `onDeleted` runs once the delete is written.
 */
export function deleteWithUndo(task: Task, onDeleted?: () => void): void {
    saveLocally(deleteTask(task.id), {
        error: 'Could not delete the task.',
        onSaved: () => {
            onDeleted?.();
            toast('Task deleted.', {
                action: {
                    label: 'Undo',
                    onClick: () =>
                        saveLocally(restoreTask(task.id), {
                            error: 'Could not restore the task.',
                        }),
                },
            });
        },
    });
}
