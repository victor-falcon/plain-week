import { useEffect } from 'react';
import { toast } from 'sonner';
import { useCarryOverSetting } from '@/hooks/use-carry-over-setting';
import { carryOverTasks } from '@/lib/db/tasks';
import { syncEngine } from '@/lib/sync';

/**
 * Moves the unfinished tasks of earlier days to `today` when the planner
 * opens and whenever the date changes, while the setting is on, with one
 * quiet toast when anything moved.
 *
 * A signed-in device first finishes a sync run, so a task completed on
 * another device since the last sync is pulled before this one moves it (the
 * move would otherwise win last-write-wins and undo that). Call it from the
 * component that renders `SyncProvider`: parent effects run after their
 * children's, so the engine has started by then. `sync()` never rejects;
 * offline (or backing off after errors) it returns at once and the move
 * happens locally, like any offline edit.
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

            const moved = await carryOverTasks(today);

            // One quiet note per run (never per task), so a backlog moving at
            // once is not a surprise. Only the tab that moved them shows it.
            if (moved > 0) {
                toast(
                    moved === 1
                        ? 'Moved 1 unfinished task to today'
                        : `Moved ${moved} unfinished tasks to today`,
                );
            }
        };

        run().catch((error: unknown) => {
            // Carrying over is a convenience: the planner works without it.
            console.warn('Could not move unfinished tasks to today.', error);
        });
    }, [today, enabled]);
}
