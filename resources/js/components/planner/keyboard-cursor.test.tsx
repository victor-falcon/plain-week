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
import { KeyboardCursorProvider } from '@/components/planner/keyboard-cursor';
import { ScopePromptProvider } from '@/components/planner/scope-prompt';
import { TaskList } from '@/components/planner/task-list';
import { Toaster } from '@/components/ui/sonner';
import { wipeLocalDatabase } from '@/lib/db/database';
import { createTask, listTasksIn } from '@/lib/db/tasks';
import { parseDateKey } from '@/lib/db/dates';

const MONDAY = '2026-10-12';
const TUESDAY = '2026-10-13';

function Day({ date }: { date: string }) {
    const tasks = useLiveQuery(() => listTasksIn({ date }), [date]);

    return (
        <TaskList
            placement={{ date }}
            tasks={tasks}
            rows={3}
            newTaskLabel={`New task for ${date}`}
            onOpenTask={() => {}}
        />
    );
}

function Planner({ onOpenTask }: { onOpenTask: (id: string) => void }) {
    return (
        <ScopePromptProvider>
            <KeyboardCursorProvider
                today={MONDAY}
                navigation={{
                    weekStart: parseDateKey(MONDAY),
                    previousWeek: () => {},
                    nextWeek: () => {},
                    goToToday: () => {},
                }}
                onOpenTask={onOpenTask}
            >
                <Day date={MONDAY} />
                <Day date={TUESDAY} />
            </KeyboardCursorProvider>
            <Toaster />
        </ScopePromptProvider>
    );
}

const textsOf = async (date: string) =>
    (await listTasksIn({ date })).map((task) => task.text);

function cursorRow(): HTMLElement | null {
    return document.querySelector('[data-cursor]');
}

beforeEach(async () => {
    await wipeLocalDatabase();
    await createTask({ date: MONDAY, text: 'Buy milk' });
    await createTask({ date: MONDAY, text: 'Call mom' });
});

afterEach(() => {
    cleanup();
});

describe('KeyboardCursorProvider', () => {
    it('shows no cursor until a key is pressed', async () => {
        render(<Planner onOpenTask={() => {}} />);
        await screen.findByRole('button', { name: 'Buy milk' });

        expect(cursorRow()).toBeNull();
    });

    it("moves a focused cursor from today's first task", async () => {
        const user = userEvent.setup();
        render(<Planner onOpenTask={() => {}} />);
        const first = await screen.findByRole('button', { name: 'Buy milk' });

        await user.keyboard('j');

        expect(document.activeElement).toBe(first);
        expect(cursorRow()?.contains(first)).toBe(true);

        await user.keyboard('jj');

        // The new-task row is the last stop.
        await waitFor(() =>
            expect(cursorRow()?.hasAttribute('data-new-task-row')).toBe(true),
        );
        expect(document.activeElement).toBe(cursorRow());

        await user.keyboard('l');

        expect(
            cursorRow()?.closest('[data-list]')?.getAttribute('data-list'),
        ).toBe(TUESDAY);

        await user.keyboard('{Escape}');

        expect(cursorRow()).toBeNull();
    });

    it('hides the cursor on a pointer press', async () => {
        const user = userEvent.setup();
        render(<Planner onOpenTask={() => {}} />);
        await screen.findByRole('button', { name: 'Buy milk' });

        await user.keyboard('j');
        await user.pointer({ keys: '[MouseLeft]', target: document.body });

        expect(cursorRow()).toBeNull();
    });

    it('opens, completes and reorders the task under the cursor', async () => {
        const user = userEvent.setup();
        const onOpenTask = vi.fn();
        render(<Planner onOpenTask={onOpenTask} />);
        await screen.findByRole('button', { name: 'Buy milk' });
        const [milk] = await listTasksIn({ date: MONDAY });

        await user.keyboard('jo');
        expect(onOpenTask).toHaveBeenCalledWith(milk.id);

        await user.keyboard('x');
        await screen.findByRole('button', { name: 'Buy milk (done)' });

        await user.keyboard('J');
        await waitFor(async () =>
            expect(await textsOf(MONDAY)).toEqual(['Call mom', 'Buy milk']),
        );
        // The cursor follows the task.
        await waitFor(() =>
            expect(cursorRow()?.textContent).toContain('Buy milk'),
        );
    });

    it('moves the task to the next day with the cursor on it', async () => {
        const user = userEvent.setup();
        render(<Planner onOpenTask={() => {}} />);
        await screen.findByRole('button', { name: 'Buy milk' });

        await user.keyboard('j>');

        await waitFor(async () =>
            expect(await textsOf(TUESDAY)).toEqual(['Buy milk']),
        );
        await waitFor(() =>
            expect(
                cursorRow()?.closest('[data-list]')?.getAttribute('data-list'),
            ).toBe(TUESDAY),
        );
    });

    it('deletes with d d and puts the task back with u', async () => {
        const user = userEvent.setup();
        render(<Planner onOpenTask={() => {}} />);
        await screen.findByRole('button', { name: 'Buy milk' });

        await user.keyboard('jdd');

        await waitFor(async () =>
            expect(await textsOf(MONDAY)).toEqual(['Call mom']),
        );
        await screen.findByText('Task deleted.');
        // The cursor stays on the row, now the next task.
        expect(cursorRow()?.textContent).toContain('Call mom');

        await user.keyboard('u');

        await waitFor(async () =>
            expect(await textsOf(MONDAY)).toEqual(['Buy milk', 'Call mom']),
        );
    });

    it('undoes the newest undo toast first, then the one before', async () => {
        const user = userEvent.setup();
        render(<Planner onOpenTask={() => {}} />);
        await screen.findByRole('button', { name: 'Buy milk' });

        await user.keyboard('jw');
        await screen.findByText('Moved to Mon 19 Oct.');
        await user.keyboard('dd');
        await waitFor(async () => expect(await textsOf(MONDAY)).toEqual([]));

        await user.keyboard('u');
        await waitFor(async () =>
            expect(await textsOf(MONDAY)).toEqual(['Call mom']),
        );

        await user.keyboard('u');
        await waitFor(async () =>
            expect(await textsOf(MONDAY)).toEqual(['Buy milk', 'Call mom']),
        );
    });

    it('starts typing with Enter on a new-task row, or a with no cursor', async () => {
        const user = userEvent.setup();
        render(<Planner onOpenTask={() => {}} />);
        await screen.findByRole('button', { name: 'Buy milk' });
        const [input] = screen.getAllByLabelText(`New task for ${MONDAY}`);

        await user.keyboard('a');
        expect(document.activeElement).toBe(input);

        await user.keyboard('{Escape}jG');
        await user.keyboard('j{Enter}');
        expect(document.activeElement).toBe(input);
    });

    it('starts a new task in the cursor day, and Esc comes back', async () => {
        const user = userEvent.setup();
        render(<Planner onOpenTask={() => {}} />);
        await screen.findByRole('button', { name: 'Buy milk' });

        await user.keyboard('ja');

        expect(document.activeElement).toBe(
            screen.getAllByLabelText(`New task for ${MONDAY}`)[0],
        );

        await user.keyboard('Gym{Enter}{Escape}');

        await waitFor(async () =>
            expect(await textsOf(MONDAY)).toContain('Gym'),
        );
        await waitFor(() => {
            expect(cursorRow()?.hasAttribute('data-new-task-row')).toBe(true);
            expect(document.activeElement).toBe(cursorRow());
        });
    });
});
