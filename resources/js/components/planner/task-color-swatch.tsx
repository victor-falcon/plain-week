import { Check } from 'lucide-react';
import type { TaskColor } from '@/lib/db/types';
import { TASK_COLOR_STYLES } from '@/lib/planner/task-colors';
import { cn } from '@/lib/utils';

/**
 * A round 24px swatch of a task color, with a check when it is the task's
 * current color. Used by the color pickers (task dialog, context menu).
 */
export function TaskColorSwatch({
    color,
    checked,
}: {
    color: TaskColor;
    checked: boolean;
}) {
    const style = TASK_COLOR_STYLES[color];

    return (
        <span
            className={cn(
                'flex size-6 items-center justify-center rounded-full',
                style.swatch,
                style.pill,
            )}
        >
            {checked && <Check className="size-3.5" />}
        </span>
    );
}
