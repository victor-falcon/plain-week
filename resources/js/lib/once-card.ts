import { readStorage, writeStorage } from '@/lib/storage';

/**
 * The open state of a card that opens by itself once per device (an external
 * store, for `useSyncExternalStore`): closing it any way writes `seenKey` to
 * `localStorage`, and `deferToNextLoad` keeps it shut for the rest of the page
 * load so two cards never chain (see `pages/planner.tsx`).
 */
export function createOnceCardStore(seenKey: string) {
    const listeners = new Set<() => void>();

    let open = false;
    let seen = readStorage('local', seenKey) !== null;
    let deferred = false;

    function notify() {
        listeners.forEach((listener) => listener());
    }

    return {
        subscribe: (listener: () => void) => {
            listeners.add(listener);

            return () => {
                listeners.delete(listener);
            };
        },
        isOpen: () => open,
        /** Opens it on demand (a header button), seen or not. */
        open: () => {
            open = true;
            notify();
        },
        /**
         * Opens it unless it was seen on this device or deferred in this page
         * load; returns whether it opened.
         */
        openOnce: (): boolean => {
            if (seen || deferred) {
                return false;
            }

            open = true;
            notify();

            return true;
        },
        /** Another card had this load's turn: no opening by itself until the next load. */
        deferToNextLoad: () => {
            deferred = true;
        },
        /** Closes it and remembers it was seen, so it never opens by itself again. */
        close: () => {
            writeStorage('local', seenKey, '1');
            seen = true;
            open = false;
            notify();
        },
        /** Tests: back to a first visit. */
        reset: () => {
            seen = readStorage('local', seenKey) !== null;
            deferred = false;
            open = false;
            notify();
        },
    };
}
