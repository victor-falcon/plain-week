import { parseOccurrenceId } from '@/lib/recurrence/expand';
import { db as defaultDb } from './database';
import type { PlainWeekDatabase } from './database';
import type { Task } from './types';

/**
 * Demo tasks: the onboarding tasks seeded for a first-time guest. They live
 * only on this device. Their ids (and those of rows derived from them, such
 * as a deleted occurrence of the demo series) are kept in `meta.demo_ids`,
 * and they have no outbox entry, so they never reach the server. Once the
 * user changes one, it and its series family stop being demo and sync like
 * any task. See docs/architecture.md (Guest onboarding).
 */

/**
 * How a mutation affects demo rows: `release` (an edit, move, duplicate…)
 * turns them into real tasks; `keep` (delete, restore, undo) leaves them
 * demo, so deleting a demo task never syncs a tombstone; `seed` makes every
 * written row a demo row.
 */
export type DemoMode = 'release' | 'keep' | 'seed';

export async function demoIds(
    database: PlainWeekDatabase = defaultDb,
): Promise<Set<string>> {
    const entry = await database.meta.get('demo_ids');

    return new Set(Array.isArray(entry?.value) ? entry.value : []);
}

async function saveDemoIds(
    database: PlainWeekDatabase,
    ids: Set<string>,
): Promise<void> {
    if (ids.size === 0) {
        await database.meta.delete('demo_ids');
    } else {
        await database.meta.put({ key: 'demo_ids', value: [...ids] });
    }
}

/** Marks rows as demo: local only, with no outbox entry. */
async function addDemoIds(ids: Set<string>, rowIds: string[]): Promise<void> {
    rowIds.forEach((id) => ids.add(id));
    await defaultDb.outbox.bulkDelete(rowIds);
    await saveDemoIds(defaultDb, ids);
}

/**
 * Updates the demo set after a repository write, inside its transaction
 * (over `tasks`, `outbox` and `meta`).
 * `subjectId` is the id the user acted on (possibly an occurrence id), so a
 * duplicate also releases its source. A series and its exceptions are
 * released together, and released rows that were not written get queued.
 */
export async function trackDemoRows(
    rows: Task[],
    subjectId: string | undefined,
    mode: DemoMode,
): Promise<void> {
    const ids = await demoIds(defaultDb);

    if (mode === 'seed') {
        await addDemoIds(
            ids,
            rows.map((row) => row.id),
        );

        return;
    }

    if (ids.size === 0) {
        return;
    }

    const related = (id: string | null | undefined): id is string =>
        id != null && ids.has(id);

    if (mode === 'keep') {
        const derived = rows
            .filter((row) => related(row.id) || related(row.series_id))
            .map((row) => row.id);

        if (derived.length > 0) {
            await addDemoIds(ids, derived);
        }

        return;
    }

    const released = new Set<string>();

    rows.forEach((row) => {
        [row.id, row.series_id].filter(related).forEach((id) => {
            released.add(id);
        });
    });

    if (subjectId !== undefined) {
        [subjectId, parseOccurrenceId(subjectId)?.seriesId]
            .filter(related)
            .forEach((id) => released.add(id));
    }

    if (released.size === 0) {
        return;
    }

    // Pull in the whole family: the series of a released exception, then
    // every exception of a released series.
    const members = (await defaultDb.tasks.bulkGet([...ids])).filter(
        (row): row is Task => row !== undefined,
    );

    members.forEach((row) => {
        if (released.has(row.id) && related(row.series_id)) {
            released.add(row.series_id);
        }
    });
    members.forEach((row) => {
        if (row.series_id !== null && released.has(row.series_id)) {
            released.add(row.id);
        }
    });

    const written = new Set(rows.map((row) => row.id));
    const toQueue = members.filter(
        (row) => released.has(row.id) && !written.has(row.id),
    );

    await defaultDb.outbox.bulkPut(
        toQueue.map((row) => ({ task_id: row.id, revision: 1 })),
    );
    released.forEach((id) => ids.delete(id));
    await saveDemoIds(defaultDb, ids);
}

/**
 * Deletes the demo tasks the user never touched, without tombstones (the
 * server never had them). The sync engine calls it before the first push of
 * an authenticated session, inside a transaction over every table.
 */
export async function purgeDemoTasks(
    database: PlainWeekDatabase = defaultDb,
): Promise<void> {
    const ids = [...(await demoIds(database))];

    if (ids.length === 0) {
        return;
    }

    await database.tasks.bulkDelete(ids);
    await database.outbox.bulkDelete(ids);
    await database.meta.delete('demo_ids');
}
