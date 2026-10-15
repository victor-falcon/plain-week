import { v7 as uuidv7 } from 'uuid';
import { notifyLocalChange } from './changes';
import { db } from './database';
import { nextTimestamp } from './dates';
import { compareTaskOrder, positionBetween } from './position';
import type { SomedayColumn, Subtask, Task, TaskColor } from './types';

/**
 * The task repository. Every function only touches IndexedDB: none of them
 * waits on the network. Each mutation writes the record and its outbox entry in
 * one transaction, bumps `updated_at`, and wakes the sync engine.
 */

export type TaskPlacement =
    | { date: string; someday_column?: null }
    | { date: null; someday_column: SomedayColumn };

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

/** Fields that can be changed with `updateTask`. Use `moveTask` to move. */
export type TaskPatch = Partial<
    Pick<Task, 'text' | 'done' | 'color' | 'time' | 'notes' | 'subtasks'>
>;

export type MoveTaskInput = TaskPlacement & {
    /** Place the task right before this task. */
    beforeId?: string | null;
    /** Place the task right after this task. */
    afterId?: string | null;
};

async function enqueue(taskId: string): Promise<void> {
    const entry = await db.outbox.get(taskId);

    await db.outbox.put({
        task_id: taskId,
        revision: (entry?.revision ?? 0) + 1,
    });
}

/** Writes `task` and its outbox entry atomically, then wakes the sync engine. */
async function save(task: Task): Promise<Task> {
    await db.transaction('rw', db.tasks, db.outbox, async () => {
        await db.tasks.put(task);
        await enqueue(task.id);
    });

    notifyLocalChange();

    return task;
}

async function getExisting(id: string): Promise<Task> {
    const task = await db.tasks.get(id);

    if (!task || task.deleted_at !== null) {
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

/** Live (not deleted) tasks of a day or Someday column, in display order. */
export async function listTasksIn(placement: TaskPlacement): Promise<Task[]> {
    const { date, someday_column } = normalizePlacement(placement);
    const tasks =
        date !== null
            ? await db.tasks.where('date').equals(date).toArray()
            : await db.tasks
                  .where('someday_column')
                  .equals(someday_column as SomedayColumn)
                  .filter((task) => task.date === null)
                  .toArray();

    return tasks
        .filter((task) => task.deleted_at === null)
        .sort(compareTaskOrder);
}

async function lastPositionIn(
    placement: TaskPlacement,
): Promise<string | null> {
    const tasks = await listTasksIn(placement);

    return tasks.at(-1)?.position ?? null;
}

export async function createTask(input: CreateTaskInput): Promise<Task> {
    const placement = normalizePlacement(input);
    let position: string;

    if (input.afterPosition != null || input.beforePosition != null) {
        position = positionBetween(input.afterPosition, input.beforePosition);
    } else {
        position = positionBetween(await lastPositionIn(input), null);
    }

    const now = nextTimestamp();

    return save({
        id: uuidv7(),
        text: input.text,
        ...placement,
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
    });
}

export async function updateTask(id: string, patch: TaskPatch): Promise<Task> {
    const task = await getExisting(id);
    const updatedAt = nextTimestamp(task.updated_at);
    const next: Task = { ...task, ...patch, updated_at: updatedAt };

    if (patch.done !== undefined && patch.done !== task.done) {
        next.done_at = patch.done ? updatedAt : null;
    }

    return save(next);
}

export async function toggleDone(id: string): Promise<Task> {
    const task = await getExisting(id);

    return updateTask(id, { done: !task.done });
}

/** Soft-deletes the task (a tombstone that syncs like any other change). */
export async function deleteTask(id: string): Promise<Task> {
    const task = await getExisting(id);
    const now = nextTimestamp(task.updated_at);

    return save({ ...task, updated_at: now, deleted_at: now });
}

/**
 * Moves a task to a day or Someday column. With `beforeId` and/or `afterId` it
 * lands next to those tasks; with neither it goes to the end of the list.
 */
export async function moveTask(
    id: string,
    input: MoveTaskInput,
): Promise<Task> {
    const task = await getExisting(id);
    const siblings = (await listTasksIn(input)).filter(
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

    const position = positionBetween(
        siblings[afterIndex]?.position,
        siblings[beforeIndex]?.position,
    );

    return save({
        ...task,
        ...normalizePlacement(input),
        position,
        updated_at: nextTimestamp(task.updated_at),
    });
}

/** Copies a task (same day or column, new ids) right after the original. */
export async function duplicateTask(id: string): Promise<Task> {
    const task = await getExisting(id);
    const siblings = await listTasksIn(
        task.date === null
            ? { date: null, someday_column: task.someday_column ?? 0 }
            : { date: task.date },
    );
    const next = siblings[siblings.findIndex((s) => s.id === id) + 1];
    const now = nextTimestamp();

    return save({
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
    });
}
