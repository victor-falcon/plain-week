// @vitest-environment happy-dom
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vite-plus/test';
import { wipeLocalDatabase } from '@/lib/db/database';
import { createTask, setRecurrence, toggleDone } from '@/lib/db/tasks';
import { occurrenceId } from '@/lib/recurrence/expand';
import { useSeries, useTask, useWeekTasks } from './use-tasks';

beforeEach(async () => {
    await wipeLocalDatabase();
});

describe('useTask', () => {
    it('never returns the previous id result after the id changes', async () => {
        const task = await createTask({ text: 'A', date: '2026-10-12' });
        const seen: unknown[] = [];
        const { rerender, result } = renderHook(
            ({ id }: { id: string | null }) => {
                const value = useTask(id);
                seen.push({ id, value });

                return value;
            },
            { initialProps: { id: null as string | null } },
        );

        await waitFor(() => expect(result.current).toBeNull());
        seen.length = 0;
        rerender({ id: task.id });

        await waitFor(() => expect(result.current?.id).toBe(task.id));
        expect(seen).not.toContainEqual({ id: task.id, value: null });
    });
});

describe('recurring tasks', () => {
    it('lists occurrences in the week and resolves an occurrence id', async () => {
        const task = await createTask({ text: 'Gym', date: '2026-10-12' });

        await setRecurrence(task.id, { type: 'weekly', weekdays: [1, 3] });

        const week = renderHook(() => useWeekTasks(new Date(2026, 9, 12)));

        await waitFor(() =>
            expect(week.result.current?.['2026-10-14']).toMatchObject([
                { kind: 'occurrence', text: 'Gym' },
            ]),
        );

        const id = occurrenceId(task.id, '2026-10-14');
        const item = renderHook(() => {
            const value = useTask(id);

            return { value, series: useSeries(value) };
        });

        await waitFor(() =>
            expect(item.result.current.value).toMatchObject({
                id,
                kind: 'occurrence',
            }),
        );
        await waitFor(() =>
            expect(item.result.current.series?.id).toBe(task.id),
        );

        const exception = await toggleDone(id);

        await waitFor(() =>
            expect(item.result.current.value).toMatchObject({
                id: exception.id,
                kind: 'exception',
                done: true,
            }),
        );
    });
});
