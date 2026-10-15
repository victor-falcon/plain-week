import { toDateKey } from '@/lib/db/dates';
import type { Task } from '@/lib/db/types';

/**
 * The export file (a JSON backup). See "Export format" in
 * docs/architecture.md.
 */

export const EXPORT_FORMAT = 'plain-week';

export const EXPORT_VERSION = 1;

export type ExportFile = {
    format: typeof EXPORT_FORMAT;
    version: typeof EXPORT_VERSION;
    /** ISO-8601 UTC timestamp of the export. */
    exported_at: string;
    /** `package.json` version of the app that wrote the file. */
    app_version: string;
    /** Rows with exactly the wire shape of a task. */
    tasks: Task[];
};

/** `plain-week-export-YYYY-MM-DD.json`, with the local date. */
export function exportFileName(now: Date = new Date()): string {
    return `plain-week-export-${toDateKey(now)}.json`;
}

/** The app version baked in at build time (`package.json`). */
export const APP_VERSION: string = __APP_VERSION__;
