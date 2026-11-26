import { Dexie } from 'dexie';
import { notifyLocalChange } from './changes';
import { db } from './database';
import type { PlainWeekDatabase } from './database';
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

    const changed = await db.transaction('rw', [db.labels, db.outbox], () =>
        writeLabel(db, color, normalized),
    );

    if (changed) {
        notifyLocalChange();
    }
}

/**
 * Stores a normalized name for `color` with its outbox entry, unless it
 * already has that name; resolves with whether it wrote. `updated_at` comes
 * after the stored one, so the write wins last-write-wins. Call it inside a
 * read-write transaction over `labels` and `outbox`: it returns a Dexie
 * promise so that transaction stays active (see `clearAllTables`).
 */
export function writeLabel(
    database: PlainWeekDatabase,
    color: LabelColor,
    name: string,
): Promise<boolean> {
    return Dexie.Promise.all([
        database.labels.get(color),
        database.outbox.get(color),
    ]).then(([current, entry]) => {
        if ((current?.name ?? '') === name) {
            return false;
        }

        return database.labels
            .put({
                color,
                name,
                updated_at: nextTimestamp(current?.updated_at),
            })
            .then(() =>
                database.outbox.put({
                    task_id: color,
                    entity: 'label',
                    revision: (entry?.revision ?? 0) + 1,
                }),
            )
            .then(() => true);
    });
}

/** The stored label records (colours never renamed have none). */
export function queryLabels(): Promise<TaskLabel[]> {
    return db.labels.toArray();
}
