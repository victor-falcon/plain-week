import { Dexie } from 'dexie';
import { afterEach, describe, expect, it } from 'vite-plus/test';
import { makeTask } from '@/test/fixtures';
import { PlainWeekDatabase } from './database';

const NAME = 'plain-week-migration-test';

afterEach(async () => {
    await Dexie.delete(NAME);
});

describe('schema upgrades', () => {
    it('gives version 1 rows the recurrence fields, set to null', async () => {
        const legacy = new Dexie(NAME);

        legacy.version(1).stores({
            tasks: 'id, date, [date+position], someday_column, updated_at, deleted_at',
            outbox: 'task_id',
            meta: 'key',
        });

        const row: Record<string, unknown> = makeTask({ id: 'old' });

        delete row.recurrence;
        delete row.series_id;
        delete row.occurrence_date;
        await legacy.table('tasks').put(row);
        legacy.close();

        const upgraded = new PlainWeekDatabase(NAME);

        expect(await upgraded.tasks.get('old')).toMatchObject({
            id: 'old',
            recurrence: null,
            series_id: null,
            occurrence_date: null,
        });
        expect(
            await upgraded.tasks
                .where('recurrence.type')
                .anyOf(['weekly'])
                .count(),
        ).toBe(0);
        upgraded.close();
    });
});
