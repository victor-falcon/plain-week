import { toDateKey } from '@/lib/db/dates';

/**
 * How often an open planner compares the date with the one it shows. A
 * timeout to midnight alone is not enough: timers stall while a laptop
 * sleeps (it then wakes past midnight with the timeout still pending), and a
 * tab that was visible when the lid closed is still visible when it opens,
 * so `visibilitychange` never fires either.
 */
export const TODAY_CHECK_INTERVAL_MS = 30_000;

/** Window events after which the date may have changed (wake, back online). */
const WINDOW_EVENTS = ['focus', 'pageshow', 'online'] as const;

const listeners = new Set<() => void>();

let today: string | null = null;
let teardown: (() => void) | null = null;

function msUntilNextMidnight(): number {
    const now = new Date();
    const midnight = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() + 1,
    );

    return midnight.getTime() - now.getTime();
}

/** Reads the clock and tells the subscribers when the local date changed. */
function refresh(): void {
    const next = toDateKey(new Date());

    if (next !== today) {
        today = next;
        listeners.forEach((listener) => listener());
    }
}

function start(): () => void {
    let midnightTimer = 0;
    const armMidnight = () => {
        midnightTimer = window.setTimeout(() => {
            refresh();
            armMidnight();
        }, msUntilNextMidnight() + 1000);
    };
    const onVisibilityChange = () => {
        if (document.visibilityState === 'visible') {
            refresh();
        }
    };
    const interval = window.setInterval(refresh, TODAY_CHECK_INTERVAL_MS);

    armMidnight();
    WINDOW_EVENTS.forEach((event) => window.addEventListener(event, refresh));
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
        window.clearTimeout(midnightTimer);
        window.clearInterval(interval);
        WINDOW_EVENTS.forEach((event) =>
            window.removeEventListener(event, refresh),
        );
        document.removeEventListener('visibilitychange', onVisibilityChange);
    };
}

/**
 * The single source of today's local 'YYYY-MM-DD' key, as an external store
 * for `useSyncExternalStore` (see `useToday`). While anything is subscribed
 * it watches the clock: a timeout to midnight, a cheap interval, and the
 * focus, pageshow, online and visibilitychange events.
 */
export const todayStore = {
    subscribe: (listener: () => void): (() => void) => {
        listeners.add(listener);

        if (teardown === null) {
            teardown = start();
            refresh();
        }

        return () => {
            listeners.delete(listener);

            if (listeners.size === 0 && teardown !== null) {
                teardown();
                teardown = null;
                today = null;
            }
        };
    },
    getToday: (): string => (today ??= toDateKey(new Date())),
};
