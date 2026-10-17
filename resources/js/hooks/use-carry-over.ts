import { useEffect, useSyncExternalStore } from 'react';
import { carryOverTasks } from '@/lib/db/tasks';
import { carryOverSetting } from '@/lib/planner/preferences';
import { syncEngine } from '@/lib/sync';

/** Whether "Move unfinished tasks to today" is on, on this device. */
export function useCarryOverSetting(): boolean {
    return useSyncExternalStore(
        carryOverSetting.subscribe,
        carryOverSetting.isEnabled,
        carryOverSetting.isEnabled,
    );
}

/**
 * Moves the unfinished tasks of earlier days to `today` when the planner
 * opens and whenever the date changes, while the setting is on.
 *
 * A signed-in device first finishes a sync run, so a task completed on
 * another device since the last sync is pulled before this one moves it (the
 * move would otherwise win last-write-wins and undo that). Call it from the
 * component that renders `SyncProvider`: parent effects run after their
 * children's, so the engine has started by then. Offline the run returns at
 * once and the move happens locally, like any offline edit.
 */
export function useCarryOver(today: string): void {
    const enabled = useCarryOverSetting();

    useEffect(() => {
        if (!enabled) {
            return;
        }

        const run = async () => {
            if (syncEngine.isStarted) {
                await syncEngine.sync();
            }

            await carryOverTasks(today);
        };

        run().catch((error: unknown) => {
            // Carrying over is a convenience: the planner works without it.
            console.warn('Could not move unfinished tasks to today.', error);
        });
    }, [today, enabled]);
}
