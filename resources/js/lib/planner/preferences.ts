import { readStorage, writeStorage } from '@/lib/storage';

/**
 * "Move unfinished tasks to today", stored per device (it works the same for
 * guests, and Plain Week has no synced preferences). Absent means on; only
 * turning it off is stored.
 */
const CARRY_OVER_KEY = 'plain-week.carry-over';

const listeners = new Set<() => void>();

function notify(): void {
    listeners.forEach((listener) => listener());
}

function onStorage(event: StorageEvent): void {
    if (event.key === null || event.key === CARRY_OVER_KEY) {
        notify();
    }
}

/**
 * External store of the carry-over setting, for `useSyncExternalStore`. It
 * follows changes made in other tabs too (the `storage` event).
 */
export const carryOverSetting = {
    subscribe: (listener: () => void): (() => void) => {
        if (listeners.size === 0) {
            window.addEventListener('storage', onStorage);
        }

        listeners.add(listener);

        return () => {
            listeners.delete(listener);

            if (listeners.size === 0) {
                window.removeEventListener('storage', onStorage);
            }
        };
    },
    isEnabled: (): boolean => readStorage('local', CARRY_OVER_KEY) !== 'off',
    setEnabled: (enabled: boolean): void => {
        writeStorage('local', CARRY_OVER_KEY, enabled ? null : 'off');
        notify();
    },
};
