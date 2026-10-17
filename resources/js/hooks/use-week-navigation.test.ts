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
import { toDateKey } from '@/lib/db/dates';
import { useWeekNavigation } from './use-week-navigation';

vi.mock('@inertiajs/react', () => ({
    router: { replace: ({ onFinish }: { onFinish: () => void }) => onFinish() },
}));

const SUNDAY = '2026-10-18';
const MONDAY = '2026-10-19';

function shownWeek(result: { current: { weekStart: Date } }): string {
    return toDateKey(result.current.weekStart);
}

beforeEach(() => {
    window.history.replaceState(null, '', '/');
});

afterEach(() => {
    cleanup();
});

describe('useWeekNavigation', () => {
    it('follows to the new week when the current one was shown', () => {
        const { result, rerender } = renderHook(
            ({ today }) => useWeekNavigation(today),
            { initialProps: { today: SUNDAY } },
        );

        expect(shownWeek(result)).toBe('2026-10-12');

        rerender({ today: MONDAY });

        expect(shownWeek(result)).toBe('2026-10-19');
        expect(result.current.isCurrentWeek).toBe(true);
        expect(window.location.search).toBe('');
    });

    it('stays on a week the user navigated to', () => {
        const { result, rerender } = renderHook(
            ({ today }) => useWeekNavigation(today),
            { initialProps: { today: SUNDAY } },
        );

        act(() => result.current.previousWeek());
        rerender({ today: MONDAY });

        expect(shownWeek(result)).toBe('2026-10-05');
        expect(result.current.isCurrentWeek).toBe(false);
    });

    it('keeps the week when the day changes inside it', () => {
        const { result, rerender } = renderHook(
            ({ today }) => useWeekNavigation(today),
            { initialProps: { today: '2026-10-15' } },
        );

        rerender({ today: '2026-10-16' });

        expect(shownWeek(result)).toBe('2026-10-12');
    });
});
