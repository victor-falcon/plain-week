// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vite-plus/test';
import { TaskLabel } from '@/components/planner/task-row';
import type { PlannerTask } from '@/lib/recurrence/expand';

function task(overrides: Partial<PlannerTask>): PlannerTask {
    return {
        kind: 'task',
        id: 'task-1',
        text: 'Gym',
        date: '2026-10-12',
        someday_column: null,
        position: 'a0',
        done: false,
        done_at: null,
        color: 'none',
        time: null,
        notes: '',
        subtasks: [],
        created_at: '2026-10-12T00:00:00Z',
        updated_at: '2026-10-12T00:00:00Z',
        deleted_at: null,
        recurrence: null,
        series_id: null,
        occurrence_date: null,
        ...overrides,
    } as PlannerTask;
}

function textPill(overrides: Partial<PlannerTask>) {
    render(<TaskLabel task={task(overrides)} />);

    return screen.getByText('Gym');
}

afterEach(() => {
    cleanup();
});

describe('TaskLabel', () => {
    it('keeps a colored pill clear of the time pill', () => {
        expect(textPill({ time: '09:00', color: 'pink' }).className).toContain(
            'ms-1',
        );
    });

    it('adds no gap to a colored pill without a time', () => {
        expect(textPill({ color: 'pink' }).className).not.toContain('ms-1');
    });

    it('adds no gap to text without a color', () => {
        expect(textPill({ time: '09:00' }).className).not.toContain('ms-1');
    });
});
