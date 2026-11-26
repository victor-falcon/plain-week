// @vitest-environment happy-dom
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vite-plus/test';
import { wipeLocalDatabase } from '@/lib/db/database';
import { useTaskLabels } from './use-task-labels';

beforeEach(async () => {
    await wipeLocalDatabase();
});

describe('useTaskLabels', () => {
    it('starts with the default names and follows local renames', async () => {
        const { result } = renderHook(() => useTaskLabels());

        expect(result.current.labels[0]).toMatchObject({
            color: 'pink',
            name: 'Pink',
            isCustom: false,
        });
        await waitFor(() => expect(result.current.isLoading).toBe(false));

        await act(() => result.current.setLabelName('pink', 'Deep work'));

        await waitFor(() =>
            expect(result.current.labels[0]).toEqual({
                color: 'pink',
                name: 'Deep work',
                customName: 'Deep work',
                isCustom: true,
            }),
        );

        await act(() => result.current.setLabelName('pink', ''));

        await waitFor(() =>
            expect(result.current.labels[0]).toMatchObject({
                name: 'Pink',
                customName: null,
            }),
        );
    });
});
