import type { Task } from '@/lib/db/types';
import { winningException } from '@/lib/recurrence/expand';

/**
 * The rows worth backing up: every live row, and of each live series only the
 * exception that counts per occurrence (`winningException`), deleted ones
 * included, since a deleted exception is what hides a deleted occurrence.
 * Other tombstones, exceptions of deleted series and losing duplicate
 * exceptions are left out. An exception whose series is missing stays (it
 * imports as a plain task).
 *
 * Export applies it to the database, import again to the file, so a
 * hand-edited file is cleaned up the same way.
 */
export function backupRows(rows: Task[]): Task[] {
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
