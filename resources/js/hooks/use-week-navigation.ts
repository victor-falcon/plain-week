import { useEffect, useState } from 'react';
import { toDateKey } from '@/lib/db/dates';
import { addWeeks, parseWeekParam, startOfWeek } from '@/lib/planner/week';

const WEEK_PARAM = 'week';

function weekFromUrl(): Date {
    const value =
        typeof window === 'undefined'
            ? null
            : new URLSearchParams(window.location.search).get(WEEK_PARAM);

    return parseWeekParam(value) ?? startOfWeek(new Date());
}

/**
 * Writes the shown week to `?week=YYYY-MM-DD` (dropped for the current week)
 * with `history.replaceState`, so a reload keeps the position without any
 * server round trip. Inertia's history state is kept as is.
 */
function writeWeekToUrl(weekStart: Date): void {
    const url = new URL(window.location.href);
    const isCurrentWeek =
        toDateKey(weekStart) === toDateKey(startOfWeek(new Date()));

    if (isCurrentWeek) {
        url.searchParams.delete(WEEK_PARAM);
    } else {
        url.searchParams.set(WEEK_PARAM, toDateKey(weekStart));
    }

    if (url.href !== window.location.href) {
        window.history.replaceState(window.history.state, '', url);
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

/** The shown week, kept in the URL query. Works fully offline. */
export function useWeekNavigation(): WeekNavigation {
    const [weekStart, setWeekStart] = useState(weekFromUrl);
    const currentWeek = startOfWeek(new Date());

    useEffect(() => {
        writeWeekToUrl(weekStart);
    }, [weekStart]);

    return {
        weekStart,
        isCurrentWeek: toDateKey(weekStart) === toDateKey(currentWeek),
        previousWeek: () => setWeekStart((week) => addWeeks(week, -1)),
        nextWeek: () => setWeekStart((week) => addWeeks(week, 1)),
        goToToday: () => setWeekStart(startOfWeek(new Date())),
    };
}
