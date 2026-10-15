import { v7 as uuidv7 } from 'uuid';
import { notifyLocalChange } from './changes';
import { db } from './database';
import { nextTimestamp } from './dates';
import { positionBetween } from './position';
import { placementOf, queryListTasks, queryTask } from './queries';
import type { TaskPlacement } from './queries';
import type { SomedayColumn, Subtask, Task, TaskColor } from './types';

/**
 * The task repository. Every function only touches IndexedDB: none of them
 * waits on the network. Each mutation reads, changes and writes the record and
 * its outbox entry in one transaction, bumps `updated_at`, and wakes the sync
 * engine.
 */

export type { TaskPlacement } from './queries';

export type CreateTaskInput = TaskPlacement & {
    text: string;
    /** Insert right after the task with this position key. */
    afterPosition?: string | null;
    /** Insert right before the task with this position key. */
    beforePosition?: string | null;
    color?: TaskColor;
    time?: string | null;
    notes?: string;
    subtasks?: Subtask[];
};

const PATCHABLE_FIELDS = [
    'text',
    'done',
    'color',
    'time',
    'notes',
    'subtasks',
] as const;

/** Fields that can be changed with `updateTask`. Use `moveTask` to move. */
export type TaskPatch = Partial<Pick<Task, (typeof PATCHABLE_FIELDS)[number]>>;

export type MoveTaskInput = TaskPlacement & {
    /** Place the task right before this task. */
    beforeId?: string | null;
    /** Place the task right after this task. */
    afterId?: string | null;
};

/**
 * Runs `build` and writes the task it returns, plus its outbox entry, in one
 * read-write transaction, then wakes the sync engine.
 */
async function write(build: () => Promise<Task>): Promise<Task> {
    const task = await db.transaction('rw', db.tasks, db.outbox, async () => {
        const next = await build();
        const entry = await db.outbox.get(next.id);

        await db.tasks.put(next);
        await db.outbox.put({
            task_id: next.id,
            revision: (entry?.revision ?? 0) + 1,
        });

        return next;
    });

    notifyLocalChange();

    return task;
}

/** Reads a live task inside the current transaction or throws. */
async function getLive(id: string): Promise<Task> {
    const task = await queryTask(id);

    if (!task) {
        throw new Error(`Task ${id} does not exist.`);
    }

    return task;
}

function normalizePlacement(placement: TaskPlacement): {
    date: string | null;
    someday_column: SomedayColumn | null;
} {
    return placement.date === null
        ? { date: null, someday_column: placement.someday_column }
        : { date: placement.date, someday_column: null };
}

/** Live tasks of a day or Someday column, in display order. */
export function listTasksIn(placement: TaskPlacement): Promise<Task[]> {
    return queryListTasks(placement);
}

/** Applies `patch` to `task`, keeping `done_at` consistent with `done`. */
function patched(task: Task, patch: TaskPatch): Task {
    const next: Task = { ...task, updated_at: nextTimestamp(task.updated_at) };

    PATCHABLE_FIELDS.forEach((field) => {
        if (patch[field] !== undefined) {
            Object.assign(next, { [field]: patch[field] });
        }
    });

    if (next.done !== task.done) {
        next.done_at = next.done ? next.updated_at : null;
    }

    return next;
}

export function createTask(input: CreateTaskInput): Promise<Task> {
    return write(async () => {
        const hasBounds =
            input.afterPosition != null || input.beforePosition != null;
        const position = hasBounds
            ? positionBetween(input.afterPosition, input.beforePosition)
            : positionBetween(
                  (await queryListTasks(input)).at(-1)?.position,
                  null,
              );
        const now = nextTimestamp();

        return {
            id: uuidv7(),
            text: input.text,
            ...normalizePlacement(input),
            position,
            done: false,
            done_at: null,
            color: input.color ?? 'none',
            time: input.time ?? null,
            notes: input.notes ?? '',
            subtasks: input.subtasks ?? [],
            created_at: now,
            updated_at: now,
            deleted_at: null,
        };
    });
}

/** Changes `text`, `done`, `color`, `time`, `notes` or `subtasks`. */
export function updateTask(id: string, patch: TaskPatch): Promise<Task> {
    return write(async () => patched(await getLive(id), patch));
}

export function toggleDone(id: string): Promise<Task> {
    return write(async () => {
        const task = await getLive(id);

        return patched(task, { done: !task.done });
    });
}

/** Soft-deletes the task (a tombstone that syncs like any other change). */
export function deleteTask(id: string): Promise<Task> {
    return write(async () => {
        const task = await getLive(id);
        const now = nextTimestamp(task.updated_at);

        return { ...task, updated_at: now, deleted_at: now };
    });
}

/**
 * Moves a task to a day or Someday column. It lands right before `beforeId`
 * and/or right after `afterId`; a neighbour that is not in the target list is
 * ignored, and with no usable neighbour the task goes to the end.
 */
export function moveTask(id: string, input: MoveTaskInput): Promise<Task> {
    return write(async () => {
        const task = await getLive(id);
        const siblings = (await queryListTasks(input)).filter(
            (sibling) => sibling.id !== id,
        );
        const indexOf = (siblingId: string | null | undefined) =>
            siblingId ? siblings.findIndex((s) => s.id === siblingId) : -1;

        let afterIndex = indexOf(input.afterId);
        let beforeIndex = indexOf(input.beforeId);

        if (afterIndex === -1 && beforeIndex === -1) {
            afterIndex = siblings.length - 1;
            beforeIndex = siblings.length;
        } else if (beforeIndex === -1) {
            beforeIndex = afterIndex + 1;
        } else if (afterIndex === -1) {
            afterIndex = beforeIndex - 1;
        }

        return {
            ...task,
            ...normalizePlacement(input),
            position: positionBetween(
                siblings[afterIndex]?.position,
                siblings[beforeIndex]?.position,
            ),
            updated_at: nextTimestamp(task.updated_at),
        };
    });
}

/**
 * Copies a task right after the original: same content and done state, new
 * ids for the task and its subtasks.
 */
export function duplicateTask(id: string): Promise<Task> {
    return write(async () => {
        const task = await getLive(id);
        const siblings = await queryListTasks(placementOf(task));
        const next = siblings[siblings.findIndex((s) => s.id === id) + 1];
        const now = nextTimestamp();

        return {
            ...task,
            id: uuidv7(),
            position: positionBetween(task.position, next?.position),
            subtasks: task.subtasks.map((subtask) => ({
                ...subtask,
                id: uuidv7(),
            })),
            created_at: now,
            updated_at: now,
            deleted_at: null,
        };
    });
}
