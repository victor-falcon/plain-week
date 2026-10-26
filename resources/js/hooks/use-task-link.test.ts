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
import { db, wipeLocalDatabase } from '@/lib/db/database';
import { createTask, setRecurrence } from '@/lib/db/tasks';
import { occurrenceId } from '@/lib/recurrence/expand';
import { syncEngine } from '@/lib/sync';
import { makeTask } from '@/test/fixtures';
import { clearTaskParam, useTaskLink } from './use-task-link';

vi.mock('@/lib/sync', () => ({
    syncEngine: { isStarted: false, sync: vi.fn(async () => {}) },
}));

const engine = syncEngine as unknown as {
    isStarted: boolean;
    sync: ReturnType<typeof vi.fn>;
};

function openAt(path: string) {
    window.history.replaceState(null, '', path);
}

beforeEach(async () => {
    await wipeLocalDatabase();
    engine.isStarted = false;
    engine.sync.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
    cleanup();
    openAt('/');
});

describe('useTaskLink', () => {
    it('opens a task that is already stored', async () => {
        const task = await createTask({ text: 'Call mum', date: '2026-10-14' });
        const onFound = vi.fn();
        openAt(`/?task=${task.id}`);

        renderHook(() => useTaskLink(onFound));

        await waitFor(() =>
            expect(onFound).toHaveBeenCalledWith(
                expect.objectContaining({ id: task.id, text: 'Call mum' }),
            ),
        );
        expect(onFound).toHaveBeenCalledTimes(1);
    });

    it('opens an occurrence of a recurring task', async () => {
        const task = await createTask({ text: 'Gym', date: '2026-10-12' });
        await setRecurrence(task.id, { type: 'weekly', weekdays: [1, 3] });
        const id = occurrenceId(task.id, '2026-10-21');
        const onFound = vi.fn();
        openAt(`/?task=${encodeURIComponent(id)}`);

        renderHook(() => useTaskLink(onFound));

        await waitFor(() =>
            expect(onFound).toHaveBeenCalledWith(
                expect.objectContaining({ id, date: '2026-10-21' }),
            ),
        );
    });

    it('waits for a task that arrives with the first sync', async () => {
        let finishSync = () => {};
        engine.isStarted = true;
        engine.sync.mockImplementation(
            () => new Promise<void>((resolve) => (finishSync = resolve)),
        );
        const onFound = vi.fn();
        openAt('/?task=from-another-device');

        renderHook(() => useTaskLink(onFound));
        await new Promise((resolve) => setTimeout(resolve, 20));
        expect(onFound).not.toHaveBeenCalled();

        // What the pull writes, before the sync run ends.
        await db.tasks.put(
            makeTask({ id: 'from-another-device', text: 'Pulled' }),
        );

        await waitFor(() =>
            expect(onFound).toHaveBeenCalledWith(
                expect.objectContaining({ id: 'from-another-device' }),
            ),
        );
        finishSync();
        await new Promise((resolve) => setTimeout(resolve, 20));
        expect(onFound).toHaveBeenCalledTimes(1);
    });

    it('gives up quietly once a sync run ends without the task', async () => {
        let finishSync = () => {};
        engine.isStarted = true;
        engine.sync.mockImplementation(
            () => new Promise<void>((resolve) => (finishSync = resolve)),
        );
        const onFound = vi.fn();
        openAt('/?week=2026-10-12&task=missing');

        renderHook(() => useTaskLink(onFound));
        await new Promise((resolve) => setTimeout(resolve, 20));
        expect(window.location.search).toBe('?week=2026-10-12&task=missing');

        finishSync();

        await waitFor(() =>
            expect(window.location.search).toBe('?week=2026-10-12'),
        );
        expect(onFound).not.toHaveBeenCalled();
    });

    it('does nothing without a task link', async () => {
        const onFound = vi.fn();
        openAt('/?week=2026-10-12');

        renderHook(() => useTaskLink(onFound));
        await new Promise((resolve) => setTimeout(resolve, 20));

        expect(onFound).not.toHaveBeenCalled();
        expect(engine.sync).not.toHaveBeenCalled();
        expect(window.location.search).toBe('?week=2026-10-12');
    });
});

describe('clearTaskParam', () => {
    it('drops the task link and keeps the week', () => {
        openAt('/?week=2026-10-12&task=abc');

        clearTaskParam();

        expect(window.location.search).toBe('?week=2026-10-12');
    });
});
