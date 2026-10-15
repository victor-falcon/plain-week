import { beforeEach, describe, expect, it } from 'vite-plus/test';
import { wipeLocalDatabase } from './database';
import {
    queryListTasks,
    queryPendingChangeCount,
    querySomedayTasks,
    queryTask,
    queryWeekTasks,
} from './queries';
import { createTask, deleteTask } from './tasks';

beforeEach(async () => {
    await wipeLocalDatabase();
});

describe('queries', () => {
    it('groups a week by day, sorted, without tombstones', async () => {
        await createTask({ text: 'Mon 1', date: '2026-10-12' });
        const removed = await createTask({ text: 'gone', date: '2026-10-12' });
        await createTask({ text: 'Mon 2', date: '2026-10-12' });
        await createTask({ text: 'Sun', date: '2026-10-18' });
        await createTask({ text: 'next week', date: '2026-10-19' });
        await createTask({ text: 'someday', date: null, someday_column: 0 });
        await deleteTask(removed.id);

        const week = await queryWeekTasks('2026-10-12');

        expect(Object.keys(week)).toEqual([
            '2026-10-12',
            '2026-10-13',
            '2026-10-14',
            '2026-10-15',
            '2026-10-16',
            '2026-10-17',
            '2026-10-18',
        ]);
        expect(week['2026-10-12'].map((t) => t.text)).toEqual([
            'Mon 1',
            'Mon 2',
        ]);
        expect(week['2026-10-18'].map((t) => t.text)).toEqual(['Sun']);
        expect(week['2026-10-13']).toEqual([]);
    });

    it('handles weeks that cross a month boundary', async () => {
        await createTask({ text: 'Nov', date: '2026-11-02' });

        const week = await queryWeekTasks('2026-10-27');

        expect(week['2026-11-02'].map((t) => t.text)).toEqual(['Nov']);
    });

    it('splits Someday into three sorted columns', async () => {
        await createTask({ text: 'a', date: null, someday_column: 0 });
        await createTask({ text: 'b', date: null, someday_column: 2 });
        await createTask({ text: 'c', date: null, someday_column: 2 });
        await createTask({ text: 'dated', date: '2026-10-12' });

        const columns = await querySomedayTasks();

        expect(columns.map((list) => list.map((t) => t.text))).toEqual([
            ['a'],
            [],
            ['b', 'c'],
        ]);
    });

    it('returns null for deleted or unknown tasks', async () => {
        const task = await createTask({ text: 'a', date: '2026-10-12' });

        expect((await queryTask(task.id))?.text).toBe('a');
        await deleteTask(task.id);
        expect(await queryTask(task.id)).toBeNull();
        expect(await queryTask('missing')).toBeNull();
    });

    it('counts the pending local changes', async () => {
        expect(await queryPendingChangeCount()).toBe(0);

        const task = await createTask({ text: 'a', date: '2026-10-12' });
        await createTask({ text: 'b', date: null, someday_column: 1 });
        await deleteTask(task.id);

        expect(await queryPendingChangeCount()).toBe(2);
    });

    it('shows timed tasks first in a day, by time, then the rest by position', async () => {
        await createTask({ text: 'first untimed', date: '2026-10-12' });
        await createTask({ text: 'late', date: '2026-10-12', time: '18:00' });
        await createTask({ text: 'second untimed', date: '2026-10-12' });
        await createTask({ text: 'early', date: '2026-10-12', time: '07:30' });
        await createTask({
            text: 'early too',
            date: '2026-10-12',
            time: '07:30',
        });

        const week = await queryWeekTasks('2026-10-12');

        expect(week['2026-10-12'].map((task) => task.text)).toEqual([
            'early',
            'early too',
            'late',
            'first untimed',
            'second untimed',
        ]);
        // The repository order (used to place tasks) stays by position.
        expect(
            (await queryListTasks({ date: '2026-10-12' })).map((t) => t.text),
        ).toEqual([
            'first untimed',
            'late',
            'second untimed',
            'early',
            'early too',
        ]);
    });
});
