// @vitest-environment happy-dom
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vite-plus/test';
import { wipeLocalDatabase } from '@/lib/db/database';
import { createTask } from '@/lib/db/tasks';
import { useTask } from './use-tasks';

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
