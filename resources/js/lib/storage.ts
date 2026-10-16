/**
 * `localStorage` / `sessionStorage` access that never throws: storage can be
 * missing or blocked (private mode, site data off), and what is kept there
 * is only a convenience.
 */
export function readStorage(
    storage: 'local' | 'session',
    key: string,
): string | null {
    try {
        return window[`${storage}Storage`].getItem(key);
    } catch {
        return null;
    }
}

/** Stores `value` under `key`, or removes it when `value` is null. */
export function writeStorage(
    storage: 'local' | 'session',
    key: string,
    value: string | null,
): void {
    try {
        if (value === null) {
            window[`${storage}Storage`].removeItem(key);
        } else {
            window[`${storage}Storage`].setItem(key, value);
        }
    } catch {
        // Not kept: the default applies next time.
    }
}
