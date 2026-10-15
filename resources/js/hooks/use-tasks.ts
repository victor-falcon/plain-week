import { useLiveQuery } from 'dexie-react-hooks';
import { toDateKey } from '@/lib/db/dates';
import {
    queryPendingChangeCount,
    querySomedayTasks,
    queryTask,
    queryWeekTasks,
} from '@/lib/db/queries';
import type { SomedayTasks, WeekTasks } from '@/lib/db/queries';
import type { Task } from '@/lib/db/types';

export type { SomedayTasks, WeekTasks } from '@/lib/db/queries';

/**
 * Live tasks of the seven days starting at `weekStart`, keyed by 'YYYY-MM-DD'
 * and sorted. `undefined` only while the first local read is in progress.
 */
export function useWeekTasks(weekStart: Date): WeekTasks | undefined {
    const firstDay = toDateKey(weekStart);

    return useLiveQuery(() => queryWeekTasks(firstDay), [firstDay]);
}

/** Live Someday columns. `undefined` only while the first read is in progress. */
export function useSomedayTasks(): SomedayTasks | undefined {
    return useLiveQuery(() => querySomedayTasks(), []);
}

/**
 * A single live task. `undefined` while loading, `null` when it does not exist
 * or was deleted.
 */
export function useTask(
    id: string | null | undefined,
): Task | null | undefined {
    // Right after `id` changes, useLiveQuery still returns the previous
    // query's result; tagging it with its id keeps that stale value out.
    const result = useLiveQuery(
        async () => ({ id, task: id ? await queryTask(id) : null }),
        [id],
    );

    return result?.id === id ? result.task : undefined;
}

/**
 * Live number of local changes the server has not accepted yet (for guests:
 * everything they created on this device). `undefined` while loading.
 */
export function usePendingChangeCount(): number | undefined {
    return useLiveQuery(() => queryPendingChangeCount(), []);
}
