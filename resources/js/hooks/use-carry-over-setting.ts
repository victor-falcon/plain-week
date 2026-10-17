import { useSyncExternalStore } from 'react';
import { carryOverSetting } from '@/lib/planner/preferences';

/** Whether "Move unfinished tasks to today" is on, on this device. */
export function useCarryOverSetting(): boolean {
    return useSyncExternalStore(
        carryOverSetting.subscribe,
        carryOverSetting.isEnabled,
        carryOverSetting.isEnabled,
    );
}
