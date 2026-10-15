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
