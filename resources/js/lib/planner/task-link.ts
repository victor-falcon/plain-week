/**
 * Links to one task: `/?task=<id>` opens the planner on that task's week with
 * its dialog open. `<id>` is a task id or an occurrence id
 * (`${seriesId}:${YYYY-MM-DD}`). Push notifications and calendar events link
 * here (see `hooks/use-task-link.ts`).
 */
export const TASK_PARAM = 'task';

/** Ids are UUIDs, optionally with a date: anything much longer is noise. */
const MAX_ID_LENGTH = 100;

/** The task id a planner URL links to, or null when it has none. */
export function taskIdFromUrl(href: string): string | null {
    const value = new URL(href).searchParams.get(TASK_PARAM)?.trim() ?? '';

    return value !== '' && value.length <= MAX_ID_LENGTH ? value : null;
}

/**
 * The URL without its `?task=`; `?week=`, other parameters and the hash are
 * kept.
 */
export function withoutTaskParam(href: string): string {
    const url = new URL(href);

    url.searchParams.delete(TASK_PARAM);

    return url.href;
}
