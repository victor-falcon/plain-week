import { useEffect, useState } from 'react';
import { toDateKey } from '@/lib/db/dates';

function msUntilNextMidnight(): number {
    const now = new Date();
    const midnight = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() + 1,
    );

    return midnight.getTime() - now.getTime();
}

/**
 * Today's local 'YYYY-MM-DD' key. It updates at midnight and when the tab
 * becomes visible again, so a planner left open overnight moves on.
 */
export function useToday(): string {
    const [today, setToday] = useState(() => toDateKey(new Date()));

    useEffect(() => {
        const refresh = () => setToday(toDateKey(new Date()));
        const onVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                refresh();
            }
        };
        // Re-armed by the state change when the day rolls over.
        const timer = window.setTimeout(refresh, msUntilNextMidnight() + 1000);

        document.addEventListener('visibilitychange', onVisibilityChange);

        return () => {
            window.clearTimeout(timer);
            document.removeEventListener(
                'visibilitychange',
                onVisibilityChange,
            );
        };
    }, [today]);

    return today;
}
