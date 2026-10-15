// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useLiveQuery } from 'dexie-react-hooks';
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from 'vite-plus/test';
import { TaskList } from '@/components/planner/task-list';
import { wipeLocalDatabase } from '@/lib/db/database';
import { createTask, listTasksIn } from '@/lib/db/tasks';

const DAY = '2026-10-12';
const LABEL = 'New task for Mon 12 Oct';

function Day({ onOpenTask = () => {} }: { onOpenTask?: (id: string) => void }) {
    const tasks = useLiveQuery(() => listTasksIn({ date: DAY }), []);

    return (
        <TaskList
            placement={{ date: DAY }}
            tasks={tasks}
            rows={10}
            newTaskLabel={LABEL}
            onOpenTask={onOpenTask}
        />
    );
}

beforeEach(async () => {
    await wipeLocalDatabase();
});

afterEach(() => {
    cleanup();
});

describe('TaskList', () => {
    it('fills the day with empty rows', () => {
        render(<Day />);

        expect(screen.getAllByLabelText(LABEL)).toHaveLength(10);
    });

    it('creates a task with Enter, with smart time, and keeps typing below it', async () => {
        const user = userEvent.setup();
        render(<Day />);

        await user.click(screen.getAllByLabelText(LABEL)[3]);
        await user.keyboard('17:30 Gym{Enter}');

        const row = await screen.findByRole('button', { name: '17:30 Gym' });
        const [task] = await listTasksIn({ date: DAY });

        expect(task).toMatchObject({ text: 'Gym', time: '17:30' });
        expect(row.textContent).toContain('17:30');

        // Focus moved to the first empty row, now right below the new task.
        const emptyRows = screen.getAllByLabelText(LABEL);
        expect(emptyRows).toHaveLength(9);
        expect(document.activeElement).toBe(emptyRows[0]);
        expect(row.nextElementSibling?.contains(emptyRows[0])).toBe(true);

        await user.keyboard('Read{Enter}');
        await screen.findByRole('button', { name: 'Read' });

        expect((await listTasksIn({ date: DAY })).map((t) => t.text)).toEqual([
            'Gym',
            'Read',
        ]);
    });

    it('cancels with Escape', async () => {
        const user = userEvent.setup();
        render(<Day />);

        await user.click(screen.getAllByLabelText(LABEL)[0]);
        await user.keyboard('Nope{Escape}');

        expect(document.activeElement).not.toBe(
            screen.getAllByLabelText(LABEL)[0],
        );
        expect(await listTasksIn({ date: DAY })).toEqual([]);
    });

    it('creates the task when the row loses focus with text', async () => {
        const user = userEvent.setup();
        render(<Day />);

        await user.click(screen.getAllByLabelText(LABEL)[0]);
        await user.keyboard('Blurred');
        await user.click(document.body);

        await screen.findByRole('button', { name: 'Blurred' });
    });

    it('ignores blank input', async () => {
        const user = userEvent.setup();
        render(<Day />);

        await user.click(screen.getAllByLabelText(LABEL)[0]);
        await user.keyboard('   {Enter}');
        await user.click(document.body);

        expect(await listTasksIn({ date: DAY })).toEqual([]);
    });

    it('opens a task on click, Enter or Space', async () => {
        const task = await createTask({ text: 'Open me', date: DAY });
        const onOpenTask = vi.fn();
        const user = userEvent.setup();
        render(<Day onOpenTask={onOpenTask} />);

        const row = await screen.findByRole('button', { name: 'Open me' });
        await user.click(row);
        row.focus();
        await user.keyboard('{Enter}');
        await user.keyboard(' ');

        expect(onOpenTask).toHaveBeenCalledTimes(3);
        expect(onOpenTask).toHaveBeenCalledWith(task.id);
    });

    it('toggles done without opening the task', async () => {
        await createTask({ text: 'Finish', date: DAY });
        const onOpenTask = vi.fn();
        const user = userEvent.setup();
        render(<Day onOpenTask={onOpenTask} />);

        await user.click(
            await screen.findByRole('button', { name: 'Mark as done' }),
        );

        await waitFor(async () => {
            expect((await listTasksIn({ date: DAY }))[0].done).toBe(true);
        });
        await screen.findByRole('button', { name: 'Mark as not done' });
        expect(onOpenTask).not.toHaveBeenCalled();
    });
});
