// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vite-plus/test';
import { TaskLabel } from '@/components/planner/task-row';
import type { Task } from '@/lib/db/types';
import { makeTask } from '@/test/fixtures';

function textPill(overrides: Partial<Task>) {
    render(
        <TaskLabel
            task={{ ...makeTask({ text: 'Gym', ...overrides }), kind: 'task' }}
        />,
    );

    return screen.getByText('Gym');
}

afterEach(() => {
    cleanup();
});

describe('TaskLabel', () => {
    it('keeps a colored pill clear of the time pill', () => {
        expect(
            textPill({ time: '09:00', color: 'pink' }).classList.contains(
                'ms-1',
            ),
        ).toBe(true);
    });

    it('keeps a colored pill clear of the repeat icon', () => {
        render(
            <TaskLabel
                task={{
                    ...makeTask({ text: 'Gym', color: 'pink' }),
                    kind: 'occurrence',
                    seriesId: 'series-1',
                    occurrenceDate: '2026-10-12',
                }}
            />,
        );

        expect(screen.getByTestId('repeat-icon')).toBeTruthy();
        expect(screen.getByText('Gym').classList.contains('ms-1')).toBe(true);
    });

    it('adds no gap to a colored pill without a time', () => {
        expect(textPill({ color: 'pink' }).classList.contains('ms-1')).toBe(
            false,
        );
    });

    it('adds no gap to text without a color', () => {
        expect(textPill({ time: '09:00' }).classList.contains('ms-1')).toBe(
            false,
        );
    });
});
