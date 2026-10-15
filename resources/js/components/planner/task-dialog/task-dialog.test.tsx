// @vitest-environment happy-dom
import {
    cleanup,
    render,
    screen,
    waitFor,
    within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test';
import { ScopePromptProvider } from '@/components/planner/scope-prompt';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { db, wipeLocalDatabase } from '@/lib/db/database';
import { createTask, listTasksIn } from '@/lib/db/tasks';
import { toastAction } from '@/test/toasts';
import type { Task } from '@/lib/db/types';
import { TaskDialog } from './task-dialog';

const DAY = '2026-10-12';

function Harness({ taskId }: { taskId: string }) {
    const [openId, setOpenId] = useState<string | null>(taskId);

    return (
        <TooltipProvider>
            <ScopePromptProvider>
                <TaskDialog taskId={openId} onClose={() => setOpenId(null)} />
                <Toaster />
            </ScopePromptProvider>
        </TooltipProvider>
    );
}

async function stored(id: string): Promise<Task | undefined> {
    return db.tasks.get(id);
}

async function open(
    fields: { notes?: string; subtasks?: Task['subtasks'] } = {},
) {
    const task = await createTask({ text: 'Plan trip', date: DAY, ...fields });
    const user = userEvent.setup();

    render(<Harness taskId={task.id} />);
    const dialog = await screen.findByRole('dialog', { name: 'Edit task' });

    return { task, user, dialog };
}

beforeEach(async () => {
    await wipeLocalDatabase();
});

afterEach(() => {
    cleanup();
});

describe('TaskDialog', () => {
    it('shows the date, the title and the notes', async () => {
        const { dialog } = await open({ notes: 'Book hotel' });

        expect(
            within(dialog).getByRole('button', {
                name: 'Date: Mon, 12 Oct 2026',
            }),
        ).toBeTruthy();
        expect(
            (within(dialog).getByLabelText('Task') as HTMLTextAreaElement)
                .value,
        ).toBe('Plan trip');
        expect(
            (within(dialog).getByLabelText('Notes') as HTMLTextAreaElement)
                .value,
        ).toBe('Book hotel');
    });

    it('saves the title and notes as they are typed', async () => {
        const { task, user, dialog } = await open();

        const title = within(dialog).getByLabelText('Task');
        await user.clear(title);
        await user.type(title, 'Plan holidays');
        await user.type(within(dialog).getByLabelText('Notes'), 'Beach');

        await waitFor(async () =>
            expect(await stored(task.id)).toMatchObject({
                text: 'Plan holidays',
                notes: 'Beach',
            }),
        );
    });

    it('never saves an empty title', async () => {
        const { task, user, dialog } = await open();

        const title = within(dialog).getByLabelText(
            'Task',
        ) as HTMLTextAreaElement;
        await user.clear(title);
        await user.tab();

        expect(title.value).toBe('Plan trip');
        expect((await stored(task.id))?.text).toBe('Plan trip');
    });

    it('completes the task', async () => {
        const { task, user, dialog } = await open();

        await user.click(
            within(dialog).getByRole('button', { name: 'Mark as done' }),
        );

        await within(dialog).findByRole('button', { name: 'Mark as not done' });
        expect((await stored(task.id))?.done).toBe(true);
    });

    it('changes the date from the calendar', async () => {
        const { task, user, dialog } = await open();

        await user.click(
            within(dialog).getByRole('button', { name: /^Date:/ }),
        );
        await user.click(
            await screen.findByRole('button', { name: /October 15th, 2026/ }),
        );

        await within(dialog).findByRole('button', {
            name: 'Date: Thu, 15 Oct 2026',
        });
        expect((await stored(task.id))?.date).toBe('2026-10-15');
    });

    it('sets and clears the time', async () => {
        const { task, user, dialog } = await open();

        await user.click(
            within(dialog).getByRole('button', { name: 'Set time' }),
        );
        const input = await screen.findByLabelText('Time');
        await user.type(input, '09:30');

        await within(dialog).findByRole('button', { name: 'Time: 09:30' });
        expect((await stored(task.id))?.time).toBe('09:30');

        await user.click(screen.getByRole('button', { name: 'Clear' }));
        await within(dialog).findByRole('button', { name: 'Set time' });
        expect((await stored(task.id))?.time).toBeNull();

        // Emptying the native field clears it too.
        await user.click(
            within(dialog).getByRole('button', { name: 'Set time' }),
        );
        await user.type(await screen.findByLabelText('Time'), '10:15');
        await within(dialog).findByRole('button', { name: 'Time: 10:15' });
        await user.clear(screen.getByLabelText('Time'));
        await within(dialog).findByRole('button', { name: 'Set time' });
        expect((await stored(task.id))?.time).toBeNull();
    });

    it('changes the color', async () => {
        const { task, user, dialog } = await open();

        await user.click(
            within(dialog).getByRole('button', { name: 'Color: No color' }),
        );
        await user.click(await screen.findByRole('radio', { name: 'Pink' }));

        await within(dialog).findByRole('button', { name: 'Color: Pink' });
        expect((await stored(task.id))?.color).toBe('pink');
        expect(
            screen
                .getByRole('radio', { name: 'Pink' })
                .getAttribute('aria-checked'),
        ).toBe('true');
    });

    it('adds, edits, toggles and deletes subtasks', async () => {
        const { task, user, dialog } = await open();

        const add = within(dialog).getByLabelText('Add subtask');
        await user.type(add, 'Flights{Enter}');
        await user.type(add, 'Hotel{Enter}');

        expect(document.activeElement).toBe(add);
        expect((add as HTMLInputElement).value).toBe('');
        await waitFor(async () =>
            expect(
                (await stored(task.id))?.subtasks.map((s) => s.text),
            ).toEqual(['Flights', 'Hotel']),
        );

        await user.click(
            await within(dialog).findByRole('checkbox', {
                name: 'Complete "Flights"',
            }),
        );
        await waitFor(async () =>
            expect((await stored(task.id))?.subtasks[0].done).toBe(true),
        );

        await user.type(
            within(dialog).getAllByLabelText('Subtask')[1],
            ' room',
        );
        await user.click(
            within(dialog).getByRole('button', { name: 'Delete "Flights"' }),
        );

        await waitFor(async () =>
            expect((await stored(task.id))?.subtasks).toMatchObject([
                { text: 'Hotel room', done: false },
            ]),
        );
    });

    it('keeps a subtask typed without Enter when focus leaves or the dialog closes', async () => {
        const { task, user, dialog } = await open();

        await user.type(
            within(dialog).getByLabelText('Add subtask'),
            'Blurred',
        );
        await user.click(within(dialog).getByLabelText('Notes'));
        await user.type(within(dialog).getByLabelText('Add subtask'), 'Closed');
        await user.keyboard('{Escape}');

        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
        await waitFor(async () =>
            expect(
                (await stored(task.id))?.subtasks.map((s) => s.text),
            ).toEqual(['Blurred', 'Closed']),
        );
    });

    it('moves from a subtask to "Add subtask" with Enter', async () => {
        const { user, dialog } = await open({
            subtasks: [{ id: 's1', text: 'Flights', done: false }],
        });

        await user.click(within(dialog).getByLabelText('Subtask'));
        await user.keyboard('{Enter}');

        expect(document.activeElement).toBe(
            within(dialog).getByLabelText('Add subtask'),
        );
    });

    it('turns pasted line breaks in the title into spaces', async () => {
        const { task, user, dialog } = await open();

        const title = within(dialog).getByLabelText('Task');
        await user.clear(title);
        await user.click(title);
        await user.paste('Plan\ntrip');

        expect((title as HTMLTextAreaElement).value).toBe('Plan trip');
        await waitFor(async () =>
            expect((await stored(task.id))?.text).toBe('Plan trip'),
        );
    });

    it('moves the task with the More menu', async () => {
        const { task, user, dialog } = await open();
        const more = within(dialog).getByRole('button', { name: 'More' });

        await user.click(more);
        await user.click(
            await screen.findByRole('menuitem', { name: 'Tomorrow' }),
        );
        await within(dialog).findByRole('button', {
            name: 'Date: Tue, 13 Oct 2026',
        });

        await user.click(more);
        await user.click(
            await screen.findByRole('menuitem', { name: 'Next week' }),
        );
        await within(dialog).findByRole('button', {
            name: 'Date: Tue, 20 Oct 2026',
        });

        await user.click(more);
        await user.click(
            await screen.findByRole('menuitem', { name: 'Someday' }),
        );
        await within(dialog).findByRole('button', { name: 'Date: Someday' });
        expect(await stored(task.id)).toMatchObject({
            date: null,
            someday_column: 0,
        });
    });

    it('duplicates the task from the More menu', async () => {
        const { user, dialog } = await open();

        await user.click(within(dialog).getByRole('button', { name: 'More' }));
        await user.click(
            await screen.findByRole('menuitem', { name: 'Duplicate' }),
        );

        await waitFor(async () =>
            expect(
                (await listTasksIn({ date: DAY })).map((t) => t.text),
            ).toEqual(['Plan trip', 'Plan trip']),
        );
    });

    it('deletes the task, closes, and restores it with Undo', async () => {
        const { task, user, dialog } = await open();

        await user.click(
            within(dialog).getByRole('button', { name: 'Delete' }),
        );

        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
        expect((await stored(task.id))?.deleted_at).not.toBeNull();

        await user.click(await toastAction('Task deleted.'));

        await waitFor(async () =>
            expect((await stored(task.id))?.deleted_at).toBeNull(),
        );
        expect((await listTasksIn({ date: DAY })).map((t) => t.id)).toEqual([
            task.id,
        ]);
    });

    it('closes with Escape right after a popover closes', async () => {
        const { user, dialog } = await open();

        await user.click(
            within(dialog).getByRole('button', { name: 'Color: No color' }),
        );
        await screen.findByRole('radio', { name: 'Pink' });
        await user.keyboard('{Escape}');
        await waitFor(() =>
            expect(screen.queryByRole('radio', { name: 'Pink' })).toBeNull(),
        );
        await user.keyboard('{Escape}');

        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    });

    it('closes with Escape', async () => {
        const { user } = await open();

        await user.keyboard('{Escape}');

        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    });
});
