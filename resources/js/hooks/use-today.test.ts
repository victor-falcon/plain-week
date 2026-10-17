// @vitest-environment happy-dom
import { act, cleanup, renderHook } from '@testing-library/react';
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from 'vite-plus/test';
import { TODAY_CHECK_INTERVAL_MS } from '@/lib/planner/today';
import { useToday } from './use-today';

beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 15, 23, 59, 0));
});

afterEach(() => {
    cleanup();
    vi.useRealTimers();
});

describe('useToday', () => {
    it('rolls over at midnight', () => {
        const { result } = renderHook(() => useToday());

        expect(result.current).toBe('2026-10-15');

        act(() => {
            vi.advanceTimersByTime(61_000);
        });

        expect(result.current).toBe('2026-10-16');
    });

    it('catches up after a sleep that stalled the midnight timer', () => {
        const { result } = renderHook(() => useToday());

        // The laptop sleeps: the clock jumps, but no timer has fired yet and
        // the tab stays visible, so no visibilitychange either.
        act(() => {
            vi.setSystemTime(new Date(2026, 9, 16, 8, 30, 0));
        });
        expect(result.current).toBe('2026-10-15');

        act(() => {
            vi.advanceTimersByTime(TODAY_CHECK_INTERVAL_MS);
        });

        expect(result.current).toBe('2026-10-16');
    });

    it.each(['focus', 'pageshow', 'online'])(
        'checks the date on %s',
        (event) => {
            const { result } = renderHook(() => useToday());

            act(() => {
                vi.setSystemTime(new Date(2026, 9, 16, 8, 30, 0));
                window.dispatchEvent(new Event(event));
            });

            expect(result.current).toBe('2026-10-16');
        },
    );

    it('shares one value between every subscriber', () => {
        const first = renderHook(() => useToday());

        act(() => {
            vi.setSystemTime(new Date(2026, 9, 16, 8, 30, 0));
        });

        const second = renderHook(() => useToday());

        // A late subscriber reads the same day as the others, never a newer one.
        expect(second.result.current).toBe(first.result.current);

        act(() => {
            vi.advanceTimersByTime(TODAY_CHECK_INTERVAL_MS);
        });

        expect(first.result.current).toBe('2026-10-16');
        expect(second.result.current).toBe('2026-10-16');
    });
});
