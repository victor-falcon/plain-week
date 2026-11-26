// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useLiveQuery } from 'dexie-react-hooks';
import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test';
import { ScopePromptProvider } from '@/components/planner/scope-prompt';
import { TaskList } from '@/components/planner/task-list';
import { Toaster } from '@/components/ui/sonner';
import { wipeLocalDatabase } from '@/lib/db/database';
import { setLabelName } from '@/lib/db/labels';
import { listTasksIn } from '@/lib/db/tasks';

const DAY = '2026-10-12';
const LABEL = 'New task for Mon 12 Oct';

function Day() {
    const tasks = useLiveQuery(() => listTasksIn({ date: DAY }), []);

    return (
        <ScopePromptProvider>
            <TaskList
                placement={{ date: DAY }}
                tasks={tasks}
                newTaskLabel={LABEL}
                onOpenTask={() => {}}
            />
            <Toaster />
        </ScopePromptProvider>
    );
}

async function startTyping() {
    const user = userEvent.setup();
    render(<Day />);
    const input = screen.getByRole<HTMLInputElement>('combobox', {
        name: LABEL,
    });
    await user.click(input);

    return { user, input };
}

/** The marked parts of the mirror behind the input, with their classes. */
function marks() {
    return [...document.querySelectorAll('[data-smart-mirror] mark')].map(
        (mark) => ({ text: mark.textContent, className: mark.className }),
    );
}

beforeEach(async () => {
    await wipeLocalDatabase();
});

afterEach(() => {
    cleanup();
});

describe('NewTaskRow smart title', () => {
    it('shows a hint while focused and empty', async () => {
        const { user } = await startTyping();

        expect(
            screen.getByText('Start with a day or a time, add #label anywhere'),
        ).toBeTruthy();

        await user.keyboard('Gym');

        expect(
            screen.queryByText(
                'Start with a day or a time, add #label anywhere',
            ),
        ).toBeNull();
    });

    it('marks the date, the time and a label in place, and previews them', async () => {
        const { user, input } = await startTyping();

        await user.keyboard('31 Dec 17:30 Gym #pink now');

        expect(input.value).toBe('31 Dec 17:30 Gym #pink now');
        expect(marks().map((mark) => mark.text)).toEqual([
            '31 Dec',
            '17:30',
            '#pink',
        ]);
        expect(marks()[0].className).toContain('bg-primary/10');
        expect(marks()[2].className).toContain('bg-task-pink');

        const mirror = document.querySelector('[data-smart-mirror]')!;
        expect(mirror.getAttribute('aria-hidden')).toBe('true');
        expect(mirror.textContent).toBe(input.value);

        const chips = screen.getByRole('list', { name: 'Will be added with' });
        expect(chips.textContent).toContain('Thu 31 Dec');
        expect(chips.textContent).toContain('17:30');
        expect(chips.textContent).toContain('Pink');
    });

    it('underlines the tag being typed, solid once it names a label', async () => {
        const { user } = await startTyping();

        await user.keyboard('Gym #pin');
        expect(marks()).toEqual([
            {
                text: '#pin',
                className: expect.stringContaining('decoration-dotted'),
            },
        ]);

        await user.keyboard('k');
        expect(marks()).toEqual([
            {
                text: '#pink',
                className: expect.stringContaining('decoration-task-pink'),
            },
        ]);
    });

    it('suggests labels and picks one with the keyboard', async () => {
        const { user, input } = await startTyping();

        await user.keyboard('Gym #');

        expect(input.getAttribute('aria-expanded')).toBe('true');
        const listbox = await screen.findByRole('listbox');
        await waitFor(() =>
            expect(input.getAttribute('aria-controls')).toBe(listbox.id),
        );
        expect(
            screen.getAllByRole('option').map((option) => option.textContent),
        ).toEqual([
            'Pink',
            'Yellow',
            'Black',
            'Grey',
            'Cornflower',
            'Mango',
            'Green',
            'Lilac',
        ]);

        await user.keyboard('{ArrowDown}{ArrowDown}');
        await waitFor(() =>
            expect(input.getAttribute('aria-activedescendant')).toBe(
                screen.getByRole('option', { name: 'Black' }).id,
            ),
        );

        await user.keyboard('{ArrowUp}{Enter}');

        expect(input.value).toBe('Gym #yellow ');
        expect(input.getAttribute('aria-expanded')).toBe('false');
        expect(document.activeElement).toBe(input);

        await user.keyboard('now{Enter}');

        await screen.findByRole('button', { name: 'Gym now' });
        const [task] = await listTasksIn({ date: DAY });
        expect(task).toMatchObject({ text: 'Gym now', color: 'yellow' });
    });

    it('matches a renamed label by name or colour id, and Tab picks', async () => {
        await setLabelName('green', 'Deep work');
        const { user, input } = await startTyping();

        await user.keyboard('Focus #de');
        const option = await screen.findByRole('option', {
            name: /Deep work/,
        });
        expect(option.textContent).toContain('Green');
        expect(screen.getAllByRole('option')).toHaveLength(1);

        await user.keyboard('{Tab}');
        expect(input.value).toBe('Focus #deep-work ');
        expect(document.activeElement).toBe(input);

        await user.clear(input);
        await user.keyboard('Focus #gree');
        expect((await screen.findByRole('option')).textContent).toContain(
            'Deep work',
        );
    });

    it('picks a label with the pointer without leaving the row', async () => {
        const { user, input } = await startTyping();

        await user.keyboard('Gym #li');
        await user.click(await screen.findByRole('option', { name: 'Lilac' }));

        expect(input.value).toBe('Gym #lilac ');
        expect(document.activeElement).toBe(input);
        expect(await listTasksIn({ date: DAY })).toEqual([]);
    });

    it('says an unknown tag stays as text, and Enter creates the task', async () => {
        const { user } = await startTyping();

        await user.keyboard('Read #books');

        expect(
            await screen.findByText(
                'No label called “books”. It will stay as text.',
            ),
        ).toBeTruthy();

        await user.keyboard('{Enter}');

        await screen.findByRole('button', { name: 'Read #books' });
        const [task] = await listTasksIn({ date: DAY });
        expect(task).toMatchObject({ text: 'Read #books', color: 'none' });
    });

    it('closes the suggestions with Esc, then Enter creates the task', async () => {
        const { user, input } = await startTyping();

        await user.keyboard('Gym #pink');
        await screen.findByRole('listbox');

        await user.keyboard('{Escape}');

        expect(input.getAttribute('aria-expanded')).toBe('false');
        expect(document.activeElement).toBe(input);

        await user.keyboard('{Enter}');

        await screen.findByRole('button', { name: 'Gym' });
        const [task] = await listTasksIn({ date: DAY });
        expect(task).toMatchObject({ text: 'Gym', color: 'pink' });
    });

    it('opens the suggestions again for a new tag after Esc', async () => {
        const { user, input } = await startTyping();

        await user.keyboard('Gym #pi{Escape}');
        expect(input.getAttribute('aria-expanded')).toBe('false');

        await user.keyboard('n');
        expect(input.getAttribute('aria-expanded')).toBe('false');

        await user.keyboard('{Backspace}{Backspace}{Backspace}{Backspace}#');
        expect(input.getAttribute('aria-expanded')).toBe('true');
    });

    it('never repeats text in the mirror when a label sits inside a date', async () => {
        const { user, input } = await startTyping();

        await user.keyboard('31 #pink Dec Gym');

        const mirror = document.querySelector('[data-smart-mirror]')!;
        expect(mirror.textContent).toBe(input.value);
    });

    it('creates the task with its time and colour', async () => {
        const { user } = await startTyping();

        await user.keyboard('9:00 #mango Stand-up {Enter}');

        await screen.findByRole('button', { name: '09:00 Stand-up' });
        const [task] = await listTasksIn({ date: DAY });
        expect(task).toMatchObject({
            text: 'Stand-up',
            time: '09:00',
            color: 'mango',
        });
    });
});
