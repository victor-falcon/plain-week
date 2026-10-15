import { usePage } from '@inertiajs/react';
import { useEffect } from 'react';
import { seedDemoTasks } from '@/lib/db/demo-tasks';

/**
 * Seeds the demo tasks in the current week on a guest's very first visit.
 * Signed-in users never get them; `seedDemoTasks` makes sure a device only
 * ever seeds once.
 */
export function useGuestOnboarding(today: string): void {
    const isGuest = !usePage().props.auth?.user;

    useEffect(() => {
        if (isGuest) {
            void seedDemoTasks(today);
        }
        // Only on mount: the week of the first visit, not a later day change.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isGuest]);
}
