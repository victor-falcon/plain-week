import {
    ArrowDownToLine,
    ArrowRight,
    CalendarArrowUp,
    Copy,
    Ellipsis,
} from 'lucide-react';
import { ShortcutHint } from '@/components/planner/shortcut-hint';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuShortcut,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useMenuShortcuts } from '@/hooks/use-menu-shortcuts';
import type { MoveTaskInput } from '@/lib/db/tasks';
import type { ShortcutId } from '@/lib/planner/shortcuts';
import {
    SOMEDAY_MOVE,
    duplicateWithToast,
    moveWithUndo,
    nextWeekMove,
    tomorrowMove,
} from '@/lib/planner/task-actions';
import { useTaskEditor } from './task-editor';
import { useToolbarPicker } from './toolbar-picker';
import { TOOLBAR_BUTTON_CLASS, ToolbarTooltip } from './toolbar-tooltip';

/** The menu's items, keyed by the dialog shortcut that runs them too. */
const MENU_SHORTCUTS: ShortcutId[] = [
    'dialog.nextDay',
    'dialog.nextWeek',
    'dialog.someday',
    'dialog.duplicate',
];

export type QuickActions = {
    /** Moves are off for a series row. */
    canMove: boolean;
    /** Off for a series row and for a Someday task. */
    canMoveToSomeday: boolean;
    tomorrow: () => void;
    nextWeek: () => void;
    someday: () => void;
    duplicate: () => void;
};

/**
 * The More menu's actions, shared with the dialog's shortcuts (`>`, `w`, `s`,
 * `y`): quick moves (an occurrence moves alone, with an "Undo" toast) and
 * Duplicate (always a one-off copy).
 */
export function useQuickActions(): QuickActions {
    const { task, write } = useTaskEditor();
    const canMove = task.kind !== 'series';
    const move = (input: MoveTaskInput) =>
        write((id) => moveWithUndo(id, input), { follow: true });

    return {
        canMove,
        canMoveToSomeday: canMove && task.date !== null,
        tomorrow: () => move(tomorrowMove(task)),
        nextWeek: () => move(nextWeekMove(task)),
        someday: () => move(SOMEDAY_MOVE),
        duplicate: () => write((id) => duplicateWithToast(id)),
    };
}

function MenuShortcut({ action }: { action: ShortcutId }) {
    return (
        <DropdownMenuShortcut>
            <ShortcutHint action={action} />
        </DropdownMenuShortcut>
    );
}

/**
 * Quick moves (Tomorrow, Next week, Someday) and Duplicate, each with its
 * key, which also picks it while the menu is open.
 */
export function TaskMoreMenu() {
    const actions = useQuickActions();
    const picker = useToolbarPicker('more');
    const handleShortcut = useMenuShortcuts(MENU_SHORTCUTS);

    return (
        <DropdownMenu {...picker}>
            <ToolbarTooltip label="More" action="dialog.more">
                <DropdownMenuTrigger asChild>
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label="More"
                        className={TOOLBAR_BUTTON_CLASS}
                    >
                        <Ellipsis />
                    </Button>
                </DropdownMenuTrigger>
            </ToolbarTooltip>
            <DropdownMenuContent align="end" onKeyDown={handleShortcut}>
                <DropdownMenuItem
                    data-shortcut="dialog.nextDay"
                    disabled={!actions.canMove}
                    onSelect={actions.tomorrow}
                >
                    Tomorrow
                    <MenuShortcut action="dialog.nextDay" />
                    <ArrowRight className="rtl:rotate-180" />
                </DropdownMenuItem>
                <DropdownMenuItem
                    data-shortcut="dialog.nextWeek"
                    disabled={!actions.canMove}
                    onSelect={actions.nextWeek}
                >
                    Next week
                    <MenuShortcut action="dialog.nextWeek" />
                    <CalendarArrowUp />
                </DropdownMenuItem>
                <DropdownMenuItem
                    data-shortcut="dialog.someday"
                    disabled={!actions.canMoveToSomeday}
                    onSelect={actions.someday}
                >
                    Someday
                    <MenuShortcut action="dialog.someday" />
                    <ArrowDownToLine />
                </DropdownMenuItem>
                <DropdownMenuItem
                    data-shortcut="dialog.duplicate"
                    onSelect={actions.duplicate}
                >
                    Duplicate
                    <MenuShortcut action="dialog.duplicate" />
                    <Copy />
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
