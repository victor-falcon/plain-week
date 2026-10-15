import { db } from '@/lib/db/database';
import type { PlainWeekDatabase } from '@/lib/db/database';
import { APP_VERSION, EXPORT_FORMAT, EXPORT_VERSION } from './format';
import type { ExportFile } from './format';
import { backupRows } from './rows';

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
        tasks: backupRows(rows),
    };
}
