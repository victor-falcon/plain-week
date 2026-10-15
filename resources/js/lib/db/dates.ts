/** Formats a date as a local 'YYYY-MM-DD' key. */
export function toDateKey(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
}

/** Parses a 'YYYY-MM-DD' key as a local date (midnight). */
export function parseDateKey(key: string): Date {
    const [year, month, day] = key.split('-').map(Number);

    return new Date(year, month - 1, day);
}

/** The seven local 'YYYY-MM-DD' keys starting at `weekStart`. */
export function weekDateKeys(weekStart: Date): string[] {
    return Array.from({ length: 7 }, (_, offset) =>
        toDateKey(
            new Date(
                weekStart.getFullYear(),
                weekStart.getMonth(),
                weekStart.getDate() + offset,
            ),
        ),
    );
}

let lastTimestamp = 0;

/**
 * An ISO-8601 UTC timestamp (ms) for `updated_at`. It is strictly greater than
 * any timestamp handed out before and than `previous`, so a new local change
 * always wins last-write-wins against the version it replaces.
 */
export function nextTimestamp(previous?: string | null): string {
    const previousMs = previous ? Date.parse(previous) : Number.NaN;
    let next = Math.max(Date.now(), lastTimestamp + 1);

    if (!Number.isNaN(previousMs) && next <= previousMs) {
        next = previousMs + 1;
    }

    lastTimestamp = next;

    return new Date(next).toISOString();
}

/** Compares two ISO-8601 timestamps; negative when `a` is older than `b`. */
export function compareTimestamps(a: string, b: string): number {
    const aMs = Date.parse(a);
    const bMs = Date.parse(b);

    if (Number.isNaN(aMs) || Number.isNaN(bMs)) {
        return a < b ? -1 : a > b ? 1 : 0;
    }

    return aMs - bMs;
}
