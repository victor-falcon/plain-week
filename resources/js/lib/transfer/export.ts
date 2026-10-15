import { db } from '@/lib/db/database';
import type { PlainWeekDatabase } from '@/lib/db/database';
import { demoIds } from '@/lib/db/demo';
import { APP_VERSION, EXPORT_FORMAT, EXPORT_VERSION } from './format';
import type { ExportFile } from './format';
import { backupRows } from './rows';

/**
 * Builds the export file from the local database (no network). Demo tasks
 * (guest onboarding, never synced) are left out.
 */
export async function buildExport(
    database: PlainWeekDatabase = db,
    { now = new Date(), appVersion = APP_VERSION } = {},
): Promise<ExportFile> {
    const demo = await demoIds(database);
    const rows = await database.tasks.toArray();

    return {
        format: EXPORT_FORMAT,
        version: EXPORT_VERSION,
        exported_at: now.toISOString(),
        app_version: appVersion,
        tasks: backupRows(rows.filter((row) => !demo.has(row.id))),
    };
}
