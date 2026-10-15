import { Dexie } from 'dexie';
import type { EntityTable } from 'dexie';
import type { MetaEntry, OutboxEntry, Task } from './types';

export class PlainWeekDatabase extends Dexie {
    tasks!: EntityTable<Task, 'id'>;
    outbox!: EntityTable<OutboxEntry, 'task_id'>;
    meta!: EntityTable<MetaEntry, 'key'>;

    constructor(name = 'plain-week') {
        super(name);

        this.version(1).stores({
            tasks: 'id, date, [date+position], someday_column, updated_at, deleted_at',
            outbox: 'task_id',
            meta: 'key',
        });

        // Recurring tasks. Rows whose indexed value is null (or missing) stay
        // out of an index, so `recurrence.type` lists series rows only and
        // `[series_id+occurrence_date]` exception rows only.
        this.version(2)
            .stores({
                tasks: 'id, date, [date+position], someday_column, updated_at, deleted_at, recurrence.type, [series_id+occurrence_date]',
            })
            .upgrade((tx) =>
                tx
                    .table<Task, string>('tasks')
                    .toCollection()
                    .modify((task) => {
                        task.recurrence ??= null;
                        task.series_id ??= null;
                        task.occurrence_date ??= null;
                    }),
            );
    }
}

export const db = new PlainWeekDatabase();

/** Every table of the database; transactions that wipe must include them all. */
export function allTables(database: PlainWeekDatabase) {
    return [database.tasks, database.outbox, database.meta];
}

/** Clears every table. Call it inside a transaction over `allTables()`. */
export async function clearAllTables(
    database: PlainWeekDatabase,
): Promise<void> {
    await Promise.all(allTables(database).map((table) => table.clear()));
}

/** Removes every local record, pending change and sync metadata. */
export async function wipeLocalDatabase(
    database: PlainWeekDatabase = db,
): Promise<void> {
    await database.transaction('rw', allTables(database), () =>
        clearAllTables(database),
    );
}
