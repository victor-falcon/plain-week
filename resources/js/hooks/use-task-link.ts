import { liveQuery } from 'dexie';
import { useEffect, useRef } from 'react';
import { replaceUrl } from '@/hooks/use-week-navigation';
import { queryTask } from '@/lib/db/queries';
import { taskIdFromUrl, withoutTaskParam } from '@/lib/planner/task-link';
import type { PlannerTask } from '@/lib/recurrence/expand';
import { syncEngine } from '@/lib/sync';

/** Drops `?task=` from the address bar (no request, no history entry). */
export function clearTaskParam(): void {
    const href = withoutTaskParam(window.location.href);

    if (href !== window.location.href) {
        replaceUrl(new URL(href));
    }
}

/**
 * Follows a `/?task=<id>` link once, when the planner opens: calls `onFound`
 * with the task as soon as it exists in the local database. It may only
 * arrive with the first sync after the page loaded (a notification about a
 * task made on another device), so the lookup is live. Once a sync run has
 * finished (at once for guests or offline) and the task is still missing, it
 * gives up silently and drops `?task=` from the URL. Nothing waits on it: the
 * planner renders and works meanwhile.
 *
 * Call it from the component that renders `SyncProvider` (like
 * `useCarryOver`), so the engine has started when the effect runs.
 */
export function useTaskLink(onFound: (task: PlannerTask) => void): void {
    const onFoundRef = useRef(onFound);

    useEffect(() => {
        onFoundRef.current = onFound;
    });

    useEffect(() => {
        const id = taskIdFromUrl(window.location.href);

        if (id === null) {
            return;
        }

        let settled = false;

        const settle = (task: PlannerTask | null) => {
            if (settled) {
                return;
            }

            settled = true;
            subscription.unsubscribe();

            if (task) {
                onFoundRef.current(task);
            } else {
                clearTaskParam();
            }
        };

        const subscription = liveQuery(() => queryTask(id)).subscribe({
            next: (task) => task && settle(task),
            error: () => settle(null),
        });

        const giveUp = async () => {
            if (syncEngine.isStarted) {
                await syncEngine.sync();
            }

            settle(await queryTask(id));
        };

        giveUp().catch(() => settle(null));

        return () => {
            settled = true;
            subscription.unsubscribe();
        };
    }, []);
}
