import { addDays, isoWeekday } from '@/lib/recurrence/dates';
import { db } from './database';
import { createTask, setRecurrence, toggleDone } from './tasks';
import type { CreateTaskInput } from './tasks';
import { t } from '@/lib/i18n';

type DemoTask = CreateTaskInput & { done?: boolean; repeatWeekly?: boolean };

/**
 * The onboarding tasks, in the week of `today`. Each one teaches a feature;
 * days are offsets from Monday.
 */
function demoTasks(today: string): DemoTask[] {
    const monday = addDays(today, 1 - isoWeekday(today));
    const day = (offset: number) => addDays(monday, offset);

    return [
        { text: t('planner.demoHover'), date: day(0) },
        { text: t('planner.demoDone'), date: day(0), done: true },
        { text: t('planner.demoClick'), date: day(0) },
        { text: t('planner.demoDrag'), date: day(0) },
        { text: t('planner.demoColor'), date: day(1), color: 'yellow' },
        { text: t('planner.demoTime'), date: day(1), time: '17:30' },
        { text: t('planner.demoDate'), date: day(1) },
        { text: t('planner.demoRightClick'), date: day(2) },
        { text: t('planner.demoWeekly'), date: day(4), repeatWeekly: true },
        { text: t('planner.demoSomeday'), date: null },
    ];
}

/**
 * Claims the onboarding for this device: true only on a guest's very first
 * visit (never seeded, never owned by a user, no tasks). It marks the device
 * as seeded either way, in one transaction, so two tabs never both seed and
 * the demo never comes back, even after the user deletes every demo task.
 */
function claimOnboarding(): Promise<boolean> {
    return db.transaction('rw', db.tasks, db.meta, async () => {
        const [seeded, owner, taskCount] = await Promise.all([
            db.meta.get('demo_seeded'),
            db.meta.get('user_id'),
            db.tasks.count(),
        ]);

        if (seeded !== undefined) {
            return false;
        }

        await db.meta.put({ key: 'demo_seeded', value: 1 });

        return owner === undefined && taskCount === 0;
    });
}

/**
 * Seeds the demo tasks in the week of `today` on a guest's very first visit,
 * through the repository. Every write marks its rows as demo in its own
 * transaction, so even a seed cut short never leaves anything to push.
 * Resolves with true when it seeded.
 */
export async function seedDemoTasks(today: string): Promise<boolean> {
    if (!(await claimOnboarding())) {
        return false;
    }

    for (const { done, repeatWeekly, ...input } of demoTasks(today)) {
        const task = await createTask(input, { demo: true });

        if (done) {
            await toggleDone(task.id, { demo: true });
        }

        if (repeatWeekly && task.date !== null) {
            await setRecurrence(
                task.id,
                { type: 'weekly', weekdays: [isoWeekday(task.date)] },
                { demo: true },
            );
        }
    }

    return true;
}
