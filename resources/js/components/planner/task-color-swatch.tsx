import { Check } from 'lucide-react';
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from '@/components/ui/tooltip';
import type { TaskColor } from '@/lib/db/types';
import { TASK_COLOR_STYLES } from '@/lib/planner/task-colors';
import { cn } from '@/lib/utils';

/**
 * A round 24px swatch of a task color, with a check when it is the task's
 * current color. Used by the color pickers (task dialog, context menu). With
 * a `label` (the color's label name) it shows that name in a tooltip on
 * hover; the picker item still carries the name in its `aria-label`. The
 * tooltip sits on the swatch, not on the item, so it does not take over the
 * item's `data-state`.
 */
export function TaskColorSwatch({
    color,
    checked,
    label,
}: {
    color: TaskColor;
    checked: boolean;
    label?: string;
}) {
    const style = TASK_COLOR_STYLES[color];
    const swatch = (
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

    // Without a label (the promo video's still picker) there is no tooltip.
    if (label === undefined) {
        return swatch;
    }

    return (
        <Tooltip>
            <TooltipTrigger asChild>{swatch}</TooltipTrigger>
            <TooltipContent>{label}</TooltipContent>
        </Tooltip>
    );
}
