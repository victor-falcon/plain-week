import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';

/** Below `lg` the week is one stacked column, so today can be off screen. */
const STACKED_QUERY = '(max-width: 1023.98px)';
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';
/** How long today stays pinned while the days above it settle. */
const PIN_MS = 3000;
/** Anything the user does to the page ends the pin. */
const USER_INPUT = ['pointerdown', 'touchstart', 'wheel', 'keydown'] as const;

function matches(query: string): boolean {
    return window.matchMedia?.(query).matches ?? false;
}

/**
 * Keeps today in view after a scroll while the days above it still change
 * height or the page grows (tasks carried over to today after a sync, a
 * guest's demo tasks), until the user touches the page or `PIN_MS` passes.
 * Returns the cleanup.
 */
function pinToday(container: HTMLElement, today: HTMLElement): () => void {
    const target = parseFloat(getComputedStyle(today).scrollMarginTop) || 0;
    const observer = new ResizeObserver(() => {
        // Also when the page was too short to scroll today all the way up.
        if (Math.abs(today.getBoundingClientRect().top - target) > 1) {
            today.scrollIntoView({ block: 'start', behavior: 'instant' });
        }
    });
    const stop = () => {
        observer.disconnect();
        clearTimeout(timer);
        USER_INPUT.forEach((type) => window.removeEventListener(type, stop));
    };
    const timer = setTimeout(stop, PIN_MS);

    observer.observe(container);
    USER_INPUT.forEach((type) =>
        window.addEventListener(type, stop, { passive: true }),
    );

    return stop;
}

/**
 * On phones and tablets (the stacked single column), scrolls today's day into
 * view whenever the current week is shown: on load, after "Today" or `t`, and
 * when the arrows come back to it. Another week starts at its top. It waits
 * for the week's tasks (`ready`) so the days above today have their final
 * height. The scroll when the page opens is instant, later ones are smooth
 * unless the user prefers reduced motion. On desktop the whole week fits, so
 * it does nothing.
 *
 * `weekStartKey` is the shown week's Monday ('YYYY-MM-DD'); `container` holds
 * the days, today's marked `aria-current="date"`.
 */
export function useScrollToToday(
    container: RefObject<HTMLElement | null>,
    {
        weekStartKey,
        showsToday,
        ready,
    }: { weekStartKey: string; showsToday: boolean; ready: boolean },
): void {
    const scrolledWeek = useRef<string | null>(null);
    // False until the first loaded week: that scroll is the page opening.
    const settled = useRef(false);

    useEffect(() => {
        if (!ready || scrolledWeek.current === weekStartKey) {
            return;
        }

        const opening = !settled.current;
        settled.current = true;
        scrolledWeek.current = weekStartKey;

        if (!matches(STACKED_QUERY)) {
            return;
        }

        if (!showsToday) {
            // Leave the browser's restored position alone on load.
            if (!opening) {
                window.scrollTo({ top: 0, behavior: 'instant' });
            }

            return;
        }

        const grid = container.current;
        const today = grid?.querySelector<HTMLElement>('[aria-current="date"]');

        if (!grid || !today) {
            return;
        }

        const smooth = !opening && !matches(REDUCED_MOTION_QUERY);
        today.scrollIntoView({
            block: 'start',
            behavior: smooth ? 'smooth' : 'instant',
        });

        return smooth ? undefined : pinToday(grid, today);
    }, [container, weekStartKey, showsToday, ready]);
}
