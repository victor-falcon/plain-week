// @vitest-environment happy-dom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import type { SyncStatus } from '@/lib/sync';

let status: SyncStatus = 'idle';
const listeners = new Set<() => void>();

vi.mock('@/hooks/use-sync-status', async () => {
    const { useSyncExternalStore } = await import('react');

    return {
        useSyncStatus: () =>
            useSyncExternalStore(
                (listener) => {
                    listeners.add(listener);

                    return () => listeners.delete(listener);
                },
                () => status,
            ),
    };
});

const { useVisibleSyncStatus } = await import('./use-visible-sync-status');

function setStatus(next: SyncStatus) {
    act(() => {
        status = next;
        listeners.forEach((listener) => listener());
    });
}

afterEach(() => {
    cleanup();
    vi.useRealTimers();
    status = 'idle';
});

describe('useVisibleSyncStatus', () => {
    it('keeps the previous status during a short run', () => {
        vi.useFakeTimers();
        const { result } = renderHook(() => useVisibleSyncStatus());

        setStatus('offline');
        setStatus('syncing');
        expect(result.current).toBe('offline');

        setStatus('offline');
        expect(result.current).toBe('offline');
    });

    it('shows syncing once a run lasts a moment', () => {
        vi.useFakeTimers();
        const { result } = renderHook(() => useVisibleSyncStatus());

        setStatus('syncing');
        expect(result.current).toBe('idle');

        act(() => {
            vi.advanceTimersByTime(600);
        });
        expect(result.current).toBe('syncing');

        setStatus('idle');
        expect(result.current).toBe('idle');
    });
});
