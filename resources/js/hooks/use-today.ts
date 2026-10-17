import { useSyncExternalStore } from 'react';
import { todayStore } from '@/lib/planner/today';

/**
 * Today's local 'YYYY-MM-DD' key. It moves on by itself when the date
 * changes while the planner is open, even across a laptop's sleep (see
 * `todayStore`), so the planner never needs a reload at midnight.
 */
export function useToday(): string {
    return useSyncExternalStore(
        todayStore.subscribe,
        todayStore.getToday,
        todayStore.getToday,
    );
}
