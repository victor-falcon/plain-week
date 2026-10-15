import type { ReactElement } from 'react';
import { toast } from 'sonner';
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from '@/components/ui/tooltip';

/**
 * Classes for the dialog's round icon buttons. The button whose popover or
 * menu is open is filled, like Tweek's active toolbar icon.
 */
export const TOOLBAR_BUTTON_CLASS =
    'rounded-full aria-expanded:bg-foreground aria-expanded:text-background aria-expanded:hover:bg-foreground/90 aria-expanded:hover:text-background';

/** Wraps a trigger (a Button or a Popover/Menu trigger) with a tooltip. */
export function ToolbarTooltip({
    label,
    children,
}: {
    label: string;
    children: ReactElement;
}) {
    return (
        <Tooltip>
            <TooltipTrigger asChild>{children}</TooltipTrigger>
            <TooltipContent>{label}</TooltipContent>
        </Tooltip>
    );
}

/**
 * Runs a local write. Writes only touch IndexedDB, so they are not awaited by
 * the UI; a failure (quota, a task deleted meanwhile) is reported in a toast.
 */
export function save(write: Promise<unknown>): void {
    write.catch(() => toast.error('Could not update the task.'));
}
