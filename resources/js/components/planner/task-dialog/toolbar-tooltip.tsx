import type { ReactElement } from 'react';
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
