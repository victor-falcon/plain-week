import { useEffect, useState } from 'react';
import { parseDateKey, toDateKey } from '@/lib/db/dates';
import { addWeeks, parseWeekParam, startOfWeek } from '@/lib/planner/week';

const WEEK_PARAM = 'week';

function weekFromUrl(): Date {
    const value = new URLSearchParams(window.location.search).get(WEEK_PARAM);

    return parseWeekParam(value) ?? startOfWeek(new Date());
}

/**
 * Writes the shown week to `?week=YYYY-MM-DD` (dropped for the current week)
 * with `history.replaceState`, so a reload keeps the position without any
 * server round trip. Inertia's history state is kept as is.
 */
function writeWeekToUrl(weekStart: Date, isCurrentWeek: boolean): void {
    const url = new URL(window.location.href);

    if (isCurrentWeek) {
        url.searchParams.delete(WEEK_PARAM);
    } else {
        url.searchParams.set(WEEK_PARAM, toDateKey(weekStart));
    }

    if (url.href === window.location.href) {
        return;
    }

    try {
        window.history.replaceState(window.history.state, '', url);
    } catch {
        // Browsers rate-limit history updates (Safari: 100 per 30 s). The URL
        // is only a convenience for reloads, so skipping one is harmless.
    }
}

export type WeekNavigation = {
    /** Monday (local midnight) of the shown week. */
    weekStart: Date;
    isCurrentWeek: boolean;
    previousWeek: () => void;
    nextWeek: () => void;
    goToToday: () => void;
};

/**
 * The shown week, kept in the URL query. Works fully offline. `today` is the
 * local 'YYYY-MM-DD' key (see `useToday`). The planner is client-only: its
 * data lives in IndexedDB, so reading `window` on first render is fine.
 */
export function useWeekNavigation(today: string): WeekNavigation {
    const [weekStart, setWeekStart] = useState(weekFromUrl);
    const currentWeek = startOfWeek(parseDateKey(today));
    const isCurrentWeek = toDateKey(weekStart) === toDateKey(currentWeek);

    useEffect(() => {
        writeWeekToUrl(weekStart, isCurrentWeek);
    }, [weekStart, isCurrentWeek]);

    return {
        weekStart,
        isCurrentWeek,
        previousWeek: () => setWeekStart((week) => addWeeks(week, -1)),
        nextWeek: () => setWeekStart((week) => addWeeks(week, 1)),
        goToToday: () => setWeekStart(currentWeek),
    };
}
