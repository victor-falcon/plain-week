// @vitest-environment happy-dom
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from 'vite-plus/test';
import { wipeLocalDatabase } from '@/lib/db/database';
import { createTask, listTasksIn } from '@/lib/db/tasks';
import { carryOverSetting } from '@/lib/planner/preferences';
import { memoryStorage } from '@/test/storage';
import { useCarryOver } from './use-carry-over';

async function texts(date: string): Promise<string[]> {
    return (await listTasksIn({ date })).map((task) => task.text);
}

beforeEach(async () => {
    await wipeLocalDatabase();
    vi.stubGlobal('localStorage', memoryStorage());
});

afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
});

describe('useCarryOver', () => {
    it('carries over on start and again when the day changes', async () => {
        await createTask({ text: 'Late', date: '2026-10-14' });

        const { rerender } = renderHook(({ today }) => useCarryOver(today), {
            initialProps: { today: '2026-10-15' },
        });

        await waitFor(async () =>
            expect(await texts('2026-10-15')).toEqual(['Late']),
        );

        rerender({ today: '2026-10-16' });

        await waitFor(async () =>
            expect(await texts('2026-10-16')).toEqual(['Late']),
        );
    });

    it('moves nothing while the setting is off', async () => {
        carryOverSetting.setEnabled(false);
        await createTask({ text: 'Late', date: '2026-10-14' });

        renderHook(() => useCarryOver('2026-10-15'));
        // Give a would-be write the chance to land.
        await new Promise((resolve) => setTimeout(resolve, 20));

        expect(await texts('2026-10-14')).toEqual(['Late']);
    });

    it('defaults to on and remembers turning it off on this device', () => {
        expect(carryOverSetting.isEnabled()).toBe(true);

        carryOverSetting.setEnabled(false);
        expect(window.localStorage.getItem('plain-week.carry-over')).toBe(
            'off',
        );
        expect(carryOverSetting.isEnabled()).toBe(false);

        carryOverSetting.setEnabled(true);
        expect(window.localStorage.getItem('plain-week.carry-over')).toBeNull();
    });
});
