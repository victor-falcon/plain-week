import { Dexie } from 'dexie';
import { generateNKeysBetween } from 'fractional-indexing';
import { v7 as uuidv7 } from 'uuid';
import { notifyLocalChange } from '@/lib/db/changes';
import { db } from '@/lib/db/database';
import type { PlainWeekDatabase } from '@/lib/db/database';
import { nextTimestamp } from '@/lib/db/dates';
import { compareTaskOrder } from '@/lib/db/position';
import type { Task } from '@/lib/db/types';
import { winningException } from '@/lib/recurrence/expand';
import { EXPORT_FORMAT, EXPORT_VERSION } from './format';
import type { ExportFile } from './format';
import { ImportError, validateTask } from './validate';

export { ImportError } from './validate';

/**
 * Importing a backup ADDS its tasks next to the existing ones, with new ids;
 * nothing that is already in the local database changes. See "Export format"
 * in docs/architecture.md.
 */

export type ImportPlan = {
    /** The rows to write: series first, then plain tasks, then exceptions. */
    tasks: Task[];
    /** Tasks the user will see added: plain tasks plus series. */
    taskCount: number;
    /** How many of `taskCount` repeat. */
    recurringCount: number;
};

export type ApplyImportOptions = {
    database?: PlainWeekDatabase;
    /** Rows per transaction. */
    batchSize?: number;
    /** Called after each committed batch with the rows written so far. */
    onProgress?: (written: number, total: number) => void;
};

/**
 * Reads and validates an export file. Throws an `ImportError` with a message
 * for the user when it is not a Plain Week export, has an unsupported
 * version or holds an invalid task.
 */
export async function parseImport(input: Blob | string): Promise<ExportFile> {
    const text = typeof input === 'string' ? input : await input.text();
    let data: unknown;

    try {
        data = JSON.parse(text);
    } catch {
        throw new ImportError('This file is not valid JSON.');
    }

    if (
        typeof data !== 'object' ||
        data === null ||
        (data as { format?: unknown }).format !== EXPORT_FORMAT
    ) {
        throw new ImportError('This is not a Plain Week export file.');
    }

    const file = data as Record<string, unknown>;

    if (file.version !== EXPORT_VERSION) {
        throw new ImportError(
            typeof file.version === 'number' && file.version > EXPORT_VERSION
                ? `This file comes from a newer version of Plain Week (format version ${file.version}). Update Plain Week to import it.`
                : `Unsupported export format version: ${JSON.stringify(file.version)}.`,
        );
    }

    if (!Array.isArray(file.tasks)) {
        throw new ImportError('This file has no task list.');
    }

    const tasks = file.tasks.map((task, index) => validateTask(task, index));
    const ids = new Set<string>();

    tasks.forEach((task, index) => {
        if (ids.has(task.id)) {
            throw new ImportError(
                `Task ${index + 1}: "id" is used by another task in the file.`,
            );
        }

        ids.add(task.id);
    });

    return {
        format: EXPORT_FORMAT,
        version: EXPORT_VERSION,
        exported_at:
            typeof file.exported_at === 'string' ? file.exported_at : '',
        app_version:
            typeof file.app_version === 'string' ? file.app_version : '',
        tasks,
    };
}

function listKey(task: Pick<Task, 'date' | 'someday_column'>): string {
    return task.date ?? `someday-${task.someday_column}`;
}

/** The last position key of each day / Someday column in the database. */
async function lastPositions(
    database: PlainWeekDatabase,
    keys: Set<string>,
): Promise<Map<string, string | null>> {
    const last = new Map<string, string | null>();

    await database.transaction('r', database.tasks, async () => {
        for (const key of keys) {
            if (!key.startsWith('someday-')) {
                const row = await database.tasks
                    .where('[date+position]')
                    .between([key, Dexie.minKey], [key, Dexie.maxKey])
                    .last();
                last.set(key, row?.position ?? null);
                continue;
            }

            const rows = await database.tasks
                .where('someday_column')
                .equals(Number(key.slice('someday-'.length)))
                .filter((row) => row.date === null)
                .toArray();
            last.set(
                key,
                rows.reduce<string | null>(
                    (max, row) =>
                        max === null || row.position > max ? row.position : max,
                    null,
                ),
            );
        }
    });

    return last;
}

/**
 * Turns a parsed file into the rows to add: new UUID v7 ids, `series_id`
 * remapped to the new series (an exception whose series is not in the file
 * becomes a plain task), positions appended after the existing tasks of each
 * day / Someday column keeping the file's order, and fresh `created_at` /
 * `updated_at`. `done` and `done_at` are kept. Reads the database, never
 * writes it.
 */
export async function planImport(
    file: ExportFile,
    database: PlainWeekDatabase = db,
): Promise<ImportPlan> {
    const seriesIds = new Set(
        file.tasks
            .filter(
                (task) => task.recurrence !== null && task.deleted_at === null,
            )
            .map((task) => task.id),
    );

    // Exceptions of a series in the file: one per occurrence (duplicates are
    // settled like on screen). Without its series an exception is a plain
    // task, unless it is deleted.
    const exceptions = new Map<string, Task[]>();
    const rows: Task[] = [];

    file.tasks.forEach((task) => {
        if (task.series_id !== null && seriesIds.has(task.series_id)) {
            const key = `${task.series_id}|${task.occurrence_date}`;
            const duplicates = exceptions.get(key) ?? [];
            duplicates.push(task);
            exceptions.set(key, duplicates);
        } else if (task.deleted_at === null) {
            rows.push({ ...task, series_id: null, occurrence_date: null });
        }
    });
    exceptions.forEach((duplicates) => {
        rows.push(winningException(duplicates) as Task);
    });

    const now = nextTimestamp();
    const newIds = new Map(rows.map((task) => [task.id, uuidv7()]));
    const byList = new Map<string, Task[]>();

    rows.forEach((task) => {
        const key = listKey(task);
        const list = byList.get(key) ?? [];
        list.push(task);
        byList.set(key, list);
    });

    const last = await lastPositions(database, new Set(byList.keys()));
    const positions = new Map<string, string>();

    byList.forEach((tasks, key) => {
        const sorted = [...tasks].sort(compareTaskOrder);
        const keys = generateNKeysBetween(
            last.get(key) ?? null,
            null,
            sorted.length,
        );
        sorted.forEach((task, i) => positions.set(task.id, keys[i]));
    });

    const kindOrder = (task: Task) =>
        task.recurrence !== null ? 0 : task.series_id === null ? 1 : 2;
    const tasks = rows
        .map((task): Task => ({
            ...task,
            id: newIds.get(task.id) as string,
            position: positions.get(task.id) as string,
            series_id:
                task.series_id === null
                    ? null
                    : (newIds.get(task.series_id) as string),
            subtasks: task.subtasks.map((subtask) => ({ ...subtask })),
            created_at: now,
            updated_at: now,
            deleted_at: task.deleted_at === null ? null : now,
        }))
        .sort((a, b) => kindOrder(a) - kindOrder(b));
    const visible = tasks.filter((task) => task.series_id === null);

    return {
        tasks,
        taskCount: visible.length,
        recurringCount: visible.filter((task) => task.recurrence !== null)
            .length,
    };
}

function nextTick(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Writes a plan to the local database in batches, each in one transaction
 * with its outbox entries (so a signed-in user syncs them), yielding to the
 * event loop between batches so a large import does not freeze the UI.
 * Batches already written stay if a later one fails.
 */
export async function applyImport(
    plan: ImportPlan,
    { database = db, batchSize = 500, onProgress }: ApplyImportOptions = {},
): Promise<void> {
    const total = plan.tasks.length;

    try {
        for (let start = 0; start < total; start += batchSize) {
            const batch = plan.tasks.slice(start, start + batchSize);

            await database.transaction(
                'rw',
                database.tasks,
                database.outbox,
                async () => {
                    await database.tasks.bulkAdd(batch);
                    await database.outbox.bulkPut(
                        batch.map((task) => ({
                            task_id: task.id,
                            revision: 1,
                        })),
                    );
                },
            );

            onProgress?.(start + batch.length, total);
            await nextTick();
        }
    } finally {
        // Wake the sync engine once for the batches that were written.
        if (total > 0) {
            notifyLocalChange();
        }
    }
}
