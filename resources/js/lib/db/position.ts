import { generateKeyBetween } from 'fractional-indexing';
import type { Task } from './types';

/** Sort order inside a day or Someday column: position, then id as a tie-break. */
export function compareTaskOrder(
    a: Pick<Task, 'position' | 'id'>,
    b: Pick<Task, 'position' | 'id'>,
): number {
    if (a.position !== b.position) {
        return a.position < b.position ? -1 : 1;
    }

    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Display order inside a day: tasks with a time come first, earliest first,
 * then the rest by position (`compareTaskOrder` also breaks ties). Only the
 * display of days uses it; the repository keeps placing tasks by position.
 */
export function compareDayOrder(
    a: Pick<Task, 'time' | 'position' | 'id'>,
    b: Pick<Task, 'time' | 'position' | 'id'>,
): number {
    if (a.time !== null && b.time !== null && a.time !== b.time) {
        return a.time < b.time ? -1 : 1;
    }

    if ((a.time === null) !== (b.time === null)) {
        return a.time === null ? 1 : -1;
    }

    return compareTaskOrder(a, b);
}

/**
 * A position key strictly between `after` and `before` (either may be null for
 * the start or end of the list). If the bounds are not in order (two devices
 * produced the same key, for example) it falls back to a key after `after`.
 */
export function positionBetween(
    after: string | null | undefined,
    before: string | null | undefined,
): string {
    const lower = after ?? null;
    const upper = before ?? null;

    if (lower !== null && upper !== null && lower >= upper) {
        return generateKeyBetween(lower, null);
    }

    return generateKeyBetween(lower, upper);
}
