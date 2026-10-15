import { addDays, isoWeekday } from '@/lib/recurrence/dates';
import { allTables, db } from './database';
import { addDemoIds, isDemoSeeded, markDemoSeeded } from './demo';
import { createTask, setRecurrence, toggleDone } from './tasks';
import type { CreateTaskInput } from './tasks';

type DemoTask = CreateTaskInput & { done?: boolean; repeatWeekly?: boolean };

/**
 * The onboarding tasks, in the week of `today`. Each one teaches a feature;
 * days are offsets from Monday.
 */
function demoTasks(today: string): DemoTask[] {
    const monday = addDays(today, 1 - isoWeekday(today));
    const day = (offset: number) => addDays(monday, offset);

    return [
        { text: 'Hover a task and tick it to complete', date: day(0) },
        { text: 'Done tasks get crossed out', date: day(0), done: true },
        { text: 'Click a task to edit it', date: day(0) },
        { text: 'Drag me to another day', date: day(0) },
        { text: 'Pick a color in the editor', date: day(1), color: 'yellow' },
        { text: 'Timed tasks go first', date: day(1), time: '17:30' },
        { text: 'Right-click for quick actions', date: day(2) },
        { text: 'Weekly review', date: day(4), repeatWeekly: true },
        {
            text: 'Ideas without a date live here',
            date: null,
            someday_column: 0,
        },
    ];
}

/**
 * Seeds the demo tasks on a guest's very first visit: only when this device
 * never seeded them, never belonged to a user and has no tasks. Either way it
 * marks the device as seeded, so they never come back, even after the user
 * deletes them all. Runs in one transaction, so two tabs cannot both seed.
 * Resolves with true when it seeded.
 */
export function seedDemoTasks(today: string): Promise<boolean> {
    return db.transaction('rw', allTables(db), async () => {
        const [seeded, owner, taskCount] = await Promise.all([
            isDemoSeeded(),
            db.meta.get('user_id'),
            db.tasks.count(),
        ]);

        if (seeded) {
            return false;
        }

        await markDemoSeeded();

        if (owner !== undefined || taskCount > 0) {
            return false;
        }

        const ids: string[] = [];

        for (const { done, repeatWeekly, ...input } of demoTasks(today)) {
            const task = await createTask(input);

            ids.push(task.id);

            if (done) {
                await toggleDone(task.id);
            }

            if (repeatWeekly && task.date !== null) {
                await setRecurrence(task.id, {
                    type: 'weekly',
                    weekdays: [isoWeekday(task.date)],
                });
            }
        }

        await addDemoIds(ids);

        return true;
    });
}
