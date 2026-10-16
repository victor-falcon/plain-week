import { useSyncExternalStore } from 'react';

/**
 * Key hints are for mouse and trackpad users: a device that can hover with a
 * fine pointer. Phones and tablets (touch only) never show them.
 */
export const KEY_HINTS_MEDIA_QUERY = '(hover: hover) and (pointer: fine)';

function query(): MediaQueryList | undefined {
    return typeof window === 'undefined' || !window.matchMedia
        ? undefined
        : window.matchMedia(KEY_HINTS_MEDIA_QUERY);
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
