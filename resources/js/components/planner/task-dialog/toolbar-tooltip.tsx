import type { ReactElement } from 'react';
import { ShortcutHint } from '@/components/planner/shortcut-hint';
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from '@/components/ui/tooltip';
import type { ShortcutId } from '@/lib/planner/shortcuts';

/**
 * Classes for the dialog's round icon buttons. The button whose popover or
 * menu is open is filled, like Tweek's active toolbar icon.
 */
export const TOOLBAR_BUTTON_CLASS =
    'rounded-full aria-expanded:bg-foreground aria-expanded:text-background aria-expanded:hover:bg-foreground/90 aria-expanded:hover:text-background';

/**
 * Wraps a trigger (a Button or a Popover/Menu trigger) with a tooltip shown
 * on hover, with the key of `action` for mouse users. It does not open on
 * focus: closing a popover or menu returns focus to its trigger, and a tooltip
 * opened there would swallow the next Esc meant for the dialog. The buttons
 * carry their name in `aria-label`.
 */
export function ToolbarTooltip({
    label,
    action,
    children,
}: {
    label: string;
    action?: ShortcutId;
    children: ReactElement;
}) {
    return (
        <Tooltip>
            <TooltipTrigger asChild onFocus={(event) => event.preventDefault()}>
                {children}
            </TooltipTrigger>
            <TooltipContent>
                <span className="flex items-center gap-2">
                    {label}
                    {action && <ShortcutHint action={action} />}
                </span>
            </TooltipContent>
        </Tooltip>
    );
}
