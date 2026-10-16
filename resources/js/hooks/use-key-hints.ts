import { useSyncExternalStore } from 'react';

/**
 * Key hints are for mouse and trackpad users: a device that can hover with a
 * fine pointer. Phones and tablets (touch only) never show them.
 */
export const KEY_HINTS_MEDIA_QUERY = '(hover: hover) and (pointer: fine)';

let cached: {
    matchMedia: typeof window.matchMedia;
    mql: MediaQueryList;
} | null = null;

/** The one `MediaQueryList` every hint shares (made again if `matchMedia` is
 * replaced, as tests do). */
function query(): MediaQueryList | undefined {
    if (typeof window === 'undefined' || !window.matchMedia) {
        return undefined;
    }

    if (cached?.matchMedia !== window.matchMedia) {
        cached = {
            matchMedia: window.matchMedia,
            mql: window.matchMedia(KEY_HINTS_MEDIA_QUERY),
        };
    }

    return cached.mql;
}

function subscribe(callback: () => void): () => void {
    const mql = query();
    mql?.addEventListener('change', callback);

    return () => mql?.removeEventListener('change', callback);
}

/** Whether the device can show key hints right now. */
export function canShowKeyHints(): boolean {
    return query()?.matches ?? false;
}

/**
 * Whether to show key hints (`ShortcutHint`), following the device: plugging
 * in a mouse or switching a convertible to tablet mode updates it.
 */
export function useKeyHints(): boolean {
    return useSyncExternalStore(subscribe, canShowKeyHints, () => false);
}
