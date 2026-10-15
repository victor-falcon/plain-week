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
    }
}

export const db = new PlainWeekDatabase();

/** Removes every local record, pending change and sync metadata. */
export async function wipeLocalDatabase(
    database: PlainWeekDatabase = db,
): Promise<void> {
    await database.transaction(
        'rw',
        database.tasks,
        database.outbox,
        database.meta,
        async () => {
            await Promise.all([
                database.tasks.clear(),
                database.outbox.clear(),
                database.meta.clear(),
            ]);
        },
    );
}
