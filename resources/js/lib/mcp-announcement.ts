import { readStorage, writeStorage } from '@/lib/storage';

/** Set once the announcement was closed: it never opens by itself again on this device. */
const SEEN_KEY = 'plain-week.mcp-announcement-seen';

const listeners = new Set<() => void>();

let open = false;
let seen = readStorage('local', SEEN_KEY) !== null;
/** The landing card was shown in this page load: the announcement waits for the next one. */
let deferred = false;

function notify() {
    listeners.forEach((listener) => listener());
}

/**
 * Whether the one-time "New: connect an AI agent" card is open: an external
 * store (for `useSyncExternalStore`), opened by the planner page.
 */
export const mcpAnnouncementStore = {
    subscribe: (listener: () => void) => {
        listeners.add(listener);

        return () => {
            listeners.delete(listener);
        };
    },
    isOpen: () => open,
    /** Whether `openOnce` would open it now (not seen on this device, not deferred). */
    isPending: () => !seen && !deferred,
    /** Opens the card unless it was seen on this device or deferred in this page load. */
    openOnce: () => {
        if (!seen && !deferred) {
            open = true;
            notify();
        }
    },
    /** The landing card is showing: no announcement until the next page load. */
    deferToNextLoad: () => {
        deferred = true;
    },
    /** Closes the card (any way) and remembers it was seen on this device. */
    close: () => {
        writeStorage('local', SEEN_KEY, '1');
        seen = true;
        open = false;
        notify();
    },
    /** Tests: back to a first visit. */
    reset: () => {
        seen = readStorage('local', SEEN_KEY) !== null;
        deferred = false;
        open = false;
        notify();
    },
};
