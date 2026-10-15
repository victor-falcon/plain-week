import { usePage } from '@inertiajs/react';
import { useEffect, useRef } from 'react';
import { seedDemoTasks } from '@/lib/db/demo-tasks';

/**
 * Seeds the demo tasks on a guest's very first visit, once the current week
 * is on screen (so they are seen, not dropped into a week the guest is not
 * looking at). Signed-in users never get them; `seedDemoTasks` makes sure a
 * device only ever seeds once.
 */
export function useGuestOnboarding(today: string, isCurrentWeek: boolean) {
    const isGuest = !usePage().props.auth?.user;
    const todayRef = useRef(today);

    todayRef.current = today;

    useEffect(() => {
        if (isGuest && isCurrentWeek) {
            seedDemoTasks(todayRef.current).catch((error: unknown) => {
                // Onboarding is optional: the planner works without it.
                console.warn('Could not seed the demo tasks.', error);
            });
        }
    }, [isGuest, isCurrentWeek]);
}
