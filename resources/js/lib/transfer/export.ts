import { db } from '@/lib/db/database';
import type { PlainWeekDatabase } from '@/lib/db/database';
import type { Task } from '@/lib/db/types';
import { winningException } from '@/lib/recurrence/expand';
import { APP_VERSION, EXPORT_FORMAT, EXPORT_VERSION } from './format';
import type { ExportFile } from './format';

/**
 * The rows worth backing up: every live row, and of each live series only the
 * exception that counts per occurrence (`winningException`), deleted ones
 * included, since a deleted exception is what hides a deleted occurrence.
 * Other tombstones, exceptions of deleted series and losing duplicate
 * exceptions are left out.
 */
export function exportableTasks(rows: Task[]): Task[] {
    const seriesDeleted = new Map(
        rows
            .filter((row) => row.recurrence !== null)
            .map((row) => [row.id, row.deleted_at !== null]),
    );
    const exceptions = new Map<string, Task[]>();
    const result: Task[] = [];

    rows.forEach((row) => {
        const deletedSeries =
            row.series_id === null
                ? undefined
                : seriesDeleted.get(row.series_id);

        if (deletedSeries === false) {
            const key = `${row.series_id}|${row.occurrence_date}`;
            const duplicates = exceptions.get(key) ?? [];
            duplicates.push(row);
            exceptions.set(key, duplicates);
        } else if (deletedSeries === undefined && row.deleted_at === null) {
            // A plain row, a series, or an exception whose series is not on
            // this device (it imports as a plain task).
            result.push(row);
        }
    });

    exceptions.forEach((duplicates) => {
        result.push(winningException(duplicates) as Task);
    });

    return result;
}

/** Builds the export file from the local database (no network). */
export async function buildExport(
    database: PlainWeekDatabase = db,
    { now = new Date(), appVersion = APP_VERSION } = {},
): Promise<ExportFile> {
    const rows = await database.tasks.toArray();

    return {
        format: EXPORT_FORMAT,
        version: EXPORT_VERSION,
        exported_at: now.toISOString(),
        app_version: appVersion,
        tasks: exportableTasks(rows),
    };
}
