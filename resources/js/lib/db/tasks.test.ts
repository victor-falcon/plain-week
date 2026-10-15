import { beforeEach, describe, expect, it } from 'vite-plus/test';
import { onLocalChange } from './changes';
import { db, wipeLocalDatabase } from './database';
import {
    createTask,
    deleteTask,
    duplicateTask,
    listTasksIn,
    moveTask,
    toggleDone,
    updateTask,
} from './tasks';

const DAY = '2026-10-12';
const OTHER_DAY = '2026-10-13';

async function texts(date: string | null, column?: 0 | 1 | 2) {
    const tasks =
        date === null
            ? await listTasksIn({ date: null, someday_column: column ?? 0 })
            : await listTasksIn({ date });

    return tasks.map((task) => task.text);
}

beforeEach(async () => {
    await wipeLocalDatabase();
});

describe('task repository', () => {
    it('creates a task with defaults and an outbox entry', async () => {
        const task = await createTask({ text: 'Buy milk', date: DAY });

        expect(task).toMatchObject({
            text: 'Buy milk',
            date: DAY,
            someday_column: null,
            done: false,
            done_at: null,
            color: 'none',
            time: null,
            notes: '',
            subtasks: [],
            deleted_at: null,
        });
        expect(task.id).toMatch(/^[0-9a-f-]{36}$/);
        expect(task.id[14]).toBe('7');
        expect(task.created_at).toBe(task.updated_at);
        expect(await db.tasks.get(task.id)).toEqual(task);
        expect(await db.outbox.get(task.id)).toEqual({
            task_id: task.id,
            revision: 1,
        });
    });

    it('creates Someday tasks without a date', async () => {
        const task = await createTask({
            text: 'Read',
            date: null,
            someday_column: 2,
        });

        expect(task).toMatchObject({ date: null, someday_column: 2 });
    });

    it('bumps updated_at and the outbox revision on every mutation', async () => {
        const task = await createTask({ text: 'A', date: DAY });
        const updated = await updateTask(task.id, {
            text: 'B',
            color: 'mango',
        });

        expect(updated.text).toBe('B');
        expect(updated.color).toBe('mango');
        expect(updated.updated_at > task.updated_at).toBe(true);
        expect((await db.outbox.get(task.id))?.revision).toBe(2);
    });

    it('toggles done and done_at', async () => {
        const task = await createTask({ text: 'A', date: DAY });
        const done = await toggleDone(task.id);

        expect(done.done).toBe(true);
        expect(done.done_at).toBe(done.updated_at);

        const undone = await toggleDone(task.id);

        expect(undone.done).toBe(false);
        expect(undone.done_at).toBeNull();
    });

    it('deletes with a tombstone that is still queued for sync', async () => {
        const task = await createTask({ text: 'A', date: DAY });
        const deleted = await deleteTask(task.id);

        expect(deleted.deleted_at).toBe(deleted.updated_at);
        expect(await db.tasks.get(task.id)).toBeDefined();
        expect(await texts(DAY)).toEqual([]);
        expect(await db.outbox.get(task.id)).toBeDefined();
        await expect(updateTask(task.id, { text: 'B' })).rejects.toThrow();
    });

    it('keeps both of two concurrent edits', async () => {
        const task = await createTask({ text: 'A', date: DAY });

        await Promise.all([
            updateTask(task.id, { text: 'B' }),
            updateTask(task.id, { color: 'green' }),
            toggleDone(task.id),
        ]);

        expect(await db.tasks.get(task.id)).toMatchObject({
            text: 'B',
            color: 'green',
            done: true,
        });
        expect((await db.outbox.get(task.id))?.revision).toBe(4);
    });

    it('toggles twice when clicked twice quickly', async () => {
        const task = await createTask({ text: 'A', date: DAY });

        await Promise.all([toggleDone(task.id), toggleDone(task.id)]);

        expect((await db.tasks.get(task.id))?.done).toBe(false);
    });

    it('does not resurrect a task deleted concurrently', async () => {
        const task = await createTask({ text: 'A', date: DAY });

        const results = await Promise.allSettled([
            deleteTask(task.id),
            updateTask(task.id, { text: 'B' }),
        ]);

        expect(results[1].status).toBe('rejected');
        expect((await db.tasks.get(task.id))?.deleted_at).not.toBeNull();
    });

    it('ignores undefined and unknown patch fields', async () => {
        const task = await createTask({ text: 'A', date: DAY, color: 'pink' });
        const updated = await updateTask(task.id, {
            color: undefined,
            ...({ date: '2030-01-01', id: 'x' } as object),
        });

        expect(updated).toMatchObject({
            id: task.id,
            date: DAY,
            color: 'pink',
        });
    });

    it('notifies listeners after a mutation', async () => {
        let calls = 0;
        const unsubscribe = onLocalChange(() => calls++);

        await createTask({ text: 'A', date: DAY });
        unsubscribe();

        expect(calls).toBe(1);
    });

    it('duplicates a task right after the original with new ids', async () => {
        const first = await createTask({
            text: 'A',
            date: DAY,
            subtasks: [{ id: 's1', text: 'step', done: true }],
        });
        await createTask({ text: 'B', date: DAY });

        const copy = await duplicateTask(first.id);

        expect(copy.id).not.toBe(first.id);
        expect(copy.subtasks[0].id).not.toBe('s1');
        expect(copy.subtasks[0]).toMatchObject({ text: 'step', done: true });
        expect(await texts(DAY)).toEqual(['A', 'A', 'B']);
        expect(await db.outbox.get(copy.id)).toBeDefined();
    });
});

describe('positions', () => {
    it('appends new tasks at the end of their day', async () => {
        await createTask({ text: 'A', date: DAY });
        await createTask({ text: 'B', date: DAY });
        await createTask({ text: 'C', date: DAY });
        await createTask({ text: 'X', date: OTHER_DAY });

        expect(await texts(DAY)).toEqual(['A', 'B', 'C']);
    });

    it('inserts between explicit positions', async () => {
        const a = await createTask({ text: 'A', date: DAY });
        const b = await createTask({ text: 'B', date: DAY });

        await createTask({
            text: 'between',
            date: DAY,
            afterPosition: a.position,
            beforePosition: b.position,
        });
        await createTask({
            text: 'first',
            date: DAY,
            beforePosition: a.position,
        });

        expect(await texts(DAY)).toEqual(['first', 'A', 'between', 'B']);
    });

    it('moves a task within a day', async () => {
        const a = await createTask({ text: 'A', date: DAY });
        const b = await createTask({ text: 'B', date: DAY });
        const c = await createTask({ text: 'C', date: DAY });

        await moveTask(c.id, { date: DAY, beforeId: a.id });
        expect(await texts(DAY)).toEqual(['C', 'A', 'B']);

        await moveTask(c.id, { date: DAY, afterId: a.id });
        expect(await texts(DAY)).toEqual(['A', 'C', 'B']);

        await moveTask(a.id, { date: DAY, afterId: c.id, beforeId: b.id });
        expect(await texts(DAY)).toEqual(['C', 'A', 'B']);

        await moveTask(c.id, { date: DAY });
        expect(await texts(DAY)).toEqual(['A', 'B', 'C']);
    });

    it('moves a task between a day and Someday', async () => {
        const a = await createTask({ text: 'A', date: DAY });
        const s = await createTask({
            text: 'S',
            date: null,
            someday_column: 1,
        });

        const moved = await moveTask(a.id, {
            date: null,
            someday_column: 1,
            beforeId: s.id,
        });

        expect(moved).toMatchObject({ date: null, someday_column: 1 });
        expect(await texts(DAY)).toEqual([]);
        expect(await texts(null, 1)).toEqual(['A', 'S']);

        const back = await moveTask(a.id, { date: OTHER_DAY });

        expect(back).toMatchObject({ date: OTHER_DAY, someday_column: null });
        expect(await texts(null, 1)).toEqual(['S']);
    });

    it('breaks position ties by id', async () => {
        await db.tasks.bulkPut([
            {
                ...(await createTask({ text: 'second', date: DAY })),
                id: 'b',
                position: 'a0',
            },
            {
                ...(await createTask({ text: 'first', date: DAY })),
                id: 'a',
                position: 'a0',
            },
        ]);

        const listed = await listTasksIn({ date: DAY });

        expect(
            listed.filter((t) => t.id.length === 1).map((t) => t.text),
        ).toEqual(['first', 'second']);
    });
});
