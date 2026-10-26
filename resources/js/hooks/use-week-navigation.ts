import { router } from '@inertiajs/react';
import { useEffect, useRef, useState } from 'react';
import { parseDateKey, toDateKey } from '@/lib/db/dates';
import {
    addWeeks,
    canonicalWeekUrl,
    startOfWeek,
    weekFromUrl,
} from '@/lib/planner/week';

/**
 * Normalizes the URL the page was loaded with (an invalid or non-Monday
 * `?week=`, or the current week). Inertia records the server URL in history
 * asynchronously after the first render, so a plain `replaceState` here would
 * be overwritten; a client-side Inertia visit goes through the same history
 * queue (no request, works offline) and also keeps Inertia's page URL right.
 */
function normalizeLoadedUrl(canonical: URL, onDone: () => void): void {
    router.replace({
        url: `${canonical.pathname}${canonical.search}${canonical.hash}`,
        preserveScroll: true,
        preserveState: true,
        onFinish: onDone,
    });
}

/**
 * Records a URL change (a week change, a closed task link) with
 * `history.replaceState`: no server round trip and no new history entry.
 * Inertia's history state is kept as is.
 */
export function replaceUrl(canonical: URL): void {
    try {
        window.history.replaceState(window.history.state, '', canonical);
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
    /** Shows the week that contains `date`. */
    goToWeekOf: (date: Date) => void;
};

/**
 * The shown week, kept in the URL as `?week=YYYY-MM-DD` (its Monday; dropped
 * for the current week) so a reload keeps the position. Works fully offline.
 * `today` is the local 'YYYY-MM-DD' key (see `useToday`). The planner is
 * client-only (its data lives in IndexedDB), so reading `window` on the first
 * render is fine.
 *
 * When `today` moves into a new week (midnight between Sunday and Monday)
 * while the current week is shown, the planner follows to the new current
 * week; a week the user navigated to stays put.
 */
export function useWeekNavigation(today: string): WeekNavigation {
    const todayDate = parseDateKey(today);
    const [weekStart, setWeekStart] = useState(() =>
        weekFromUrl(window.location.href, todayDate),
    );
    const [previousToday, setPreviousToday] = useState(today);
    const currentWeek = startOfWeek(todayDate);

    // Adjusting state while rendering (not in an effect) so the planner never
    // paints the old week with the new day.
    if (previousToday !== today) {
        setPreviousToday(today);

        const previousWeek = startOfWeek(parseDateKey(previousToday));

        if (toDateKey(weekStart) === toDateKey(previousWeek)) {
            setWeekStart(currentWeek);
        }
    }

    const isCurrentWeek = toDateKey(weekStart) === toDateKey(currentWeek);
    // True until Inertia has recorded the loaded page in history.
    const loading = useRef(true);

    useEffect(() => {
        const canonical = new URL(
            canonicalWeekUrl(
                window.location.href,
                weekStart,
                parseDateKey(today),
            ),
        );
        if (canonical.href === window.location.href) {
            loading.current = false;
        } else if (loading.current) {
            normalizeLoadedUrl(canonical, () => {
                loading.current = false;
            });
        } else {
            replaceUrl(canonical);
        }
    }, [weekStart, today]);

    return {
        weekStart,
        isCurrentWeek,
        previousWeek: () => setWeekStart((week) => addWeeks(week, -1)),
        nextWeek: () => setWeekStart((week) => addWeeks(week, 1)),
        goToToday: () => setWeekStart(currentWeek),
        goToWeekOf: (date) => setWeekStart(startOfWeek(date)),
    };
}
