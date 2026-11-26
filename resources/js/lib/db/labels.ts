import { notifyLocalChange } from './changes';
import { db } from './database';
import { nextTimestamp } from './dates';
import { LABEL_COLORS, MAX_LABEL_NAME_LENGTH } from './types';
import type { LabelColor, TaskLabel } from './types';

/**
 * Label names: the name a user gave each task colour, stored locally and
 * synced like tasks (one record per colour, last-write-wins). See "Data
 * model: TaskLabel" in docs/architecture.md.
 */

/** Trims a name and collapses inner whitespace to single spaces. */
export function normalizeLabelName(name: string): string {
    return name.trim().replace(/\s+/g, ' ');
}

/**
 * Whether a (normalized) name is over `MAX_LABEL_NAME_LENGTH`, counted in
 * code points like the server (`mb_strlen`).
 */
export function isLabelNameTooLong(name: string): boolean {
    return Array.from(name).length > MAX_LABEL_NAME_LENGTH;
}

export function isLabelColor(value: unknown): value is LabelColor {
    return (LABEL_COLORS as readonly unknown[]).includes(value);
}

/**
 * Names `color`, or gives it back its default name with `''`. Local only:
 * resolves once IndexedDB has committed, then schedules a sync. Throws when
 * the normalized name is longer than `MAX_LABEL_NAME_LENGTH` (the UI limits
 * the input first). Setting the name it already has writes nothing.
 */
export async function setLabelName(
    color: LabelColor,
    name: string,
): Promise<void> {
    if (!isLabelColor(color)) {
        throw new Error(`"${String(color)}" cannot have a label name.`);
    }

    const normalized = normalizeLabelName(name);

    if (isLabelNameTooLong(normalized)) {
        throw new Error(
            `A label name has at most ${MAX_LABEL_NAME_LENGTH} characters.`,
        );
    }

    const changed = await db.transaction(
        'rw',
        [db.labels, db.outbox],
        async () => {
            const [current, entry] = await Promise.all([
                db.labels.get(color),
                db.outbox.get(color),
            ]);

            if ((current?.name ?? '') === normalized) {
                return false;
            }

            await db.labels.put({
                color,
                name: normalized,
                updated_at: nextTimestamp(current?.updated_at),
            });
            await db.outbox.put({
                task_id: color,
                entity: 'label',
                revision: (entry?.revision ?? 0) + 1,
            });

            return true;
        },
    );

    if (changed) {
        notifyLocalChange();
    }
}

/** The stored label records (colours never renamed have none). */
export function queryLabels(): Promise<TaskLabel[]> {
    return db.labels.toArray();
}
