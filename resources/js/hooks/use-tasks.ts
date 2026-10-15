import { useLiveQuery } from 'dexie-react-hooks';
import { toDateKey } from '@/lib/db/dates';
import { querySomedayTasks, queryTask, queryWeekTasks } from '@/lib/db/queries';
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
    return useLiveQuery(
        () => (id ? queryTask(id) : Promise.resolve(null)),
        [id],
    );
}
