import {
    ArrowDownToLine,
    ArrowRight,
    CalendarArrowUp,
    Copy,
    Trash2,
} from 'lucide-react';
import { useRef } from 'react';
import type { KeyboardEvent, ReactElement } from 'react';
import { ShortcutHint } from '@/components/planner/shortcut-hint';
import { TaskColorSwatch } from '@/components/planner/task-color-swatch';
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuRadioGroup,
    ContextMenuRadioItem,
    ContextMenuSeparator,
    ContextMenuShortcut,
    ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { useMenuShortcuts } from '@/hooks/use-menu-shortcuts';
import { TASK_COLORS } from '@/lib/db/types';
import type { Task, TaskColor } from '@/lib/db/types';
import type { ShortcutId } from '@/lib/planner/shortcuts';
import { TASK_COLOR_STYLES, isTaskColor } from '@/lib/planner/task-colors';

export type TaskContextMenuActions = {
    onColorChange: (color: TaskColor) => void;
    onMoveToTomorrow: () => void;
    onMoveToNextWeek: () => void;
    /** Not offered for a task that is already in Someday. */
    onMoveToSomeday: () => void;
    onDuplicate: () => void;
    onDelete: () => void;
};

type Props = TaskContextMenuActions & {
    task: Task;
    /** The task's row: a DOM element that takes a ref and event handlers. */
    children: ReactElement;
};

/** The menu's items that have a planner shortcut. */
const MENU_SHORTCUTS: ShortcutId[] = [
    'task.nextDay',
    'task.nextWeek',
    'task.someday',
    'task.duplicate',
    'task.delete',
];

/**
 * Opens the context menu of the trigger containing `element` at a point, with
 * the same `contextmenu` event a right click sends.
 */
export function openContextMenuAt(
    element: Element,
    x: number,
    y: number,
): void {
    element.dispatchEvent(
        new MouseEvent('contextmenu', {
            bubbles: true,
            cancelable: true,
            clientX: x,
            clientY: y,
        }),
    );
}

/**
 * Opens the context menu from the keyboard (Shift+F10 or the context menu
 * key) on a focused element inside the row, anchored to the row's start.
 * Browsers do not agree on whether, and where, they fire `contextmenu` for
 * those keys, so the event is dispatched here instead.
 */
function openFromKeyboard(event: KeyboardEvent<HTMLElement>): void {
    const isMenuKey =
        event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey);

    if (!isMenuKey) {
        return;
    }

    event.preventDefault();
    const row = event.currentTarget;
    const rect = row.getBoundingClientRect();
    const isRtl = getComputedStyle(row).direction === 'rtl';

    openContextMenuAt(row, isRtl ? rect.right : rect.left, rect.bottom);
}

/**
 * An item's key, before its icon. The slot stays (empty on touch devices) so
 * the icon keeps its place at the end.
 */
function MenuShortcut({ action }: { action: ShortcutId }) {
    return (
        <ContextMenuShortcut>
            <ShortcutHint action={action} />
        </ContextMenuShortcut>
    );
}

/**
 * The context menu of a task row: right click on desktop, Shift+F10 or the
 * context menu key on a focused row, and a still long press on touch screens
 * (opened by `PlannerDnd`, see planner-dnd.tsx). The nine color swatches in
 * two rows (five and four, like the dialog's color picker), the quick moves,
 * Duplicate and Delete. The actions are props so callers decide what each one
 * does.
 */
export function TaskContextMenu({
    task,
    children,
    onColorChange,
    onMoveToTomorrow,
    onMoveToNextWeek,
    onMoveToSomeday,
    onDuplicate,
    onDelete,
}: Props) {
    // Closed by a press elsewhere: leave focus where that press puts it.
    const closedFromOutside = useRef(false);
    const handleShortcut = useMenuShortcuts(MENU_SHORTCUTS);

    return (
        <ContextMenu
            onOpenChange={(open) => {
                if (open) {
                    closedFromOutside.current = false;
                }
            }}
        >
            <ContextMenuTrigger asChild onKeyDown={openFromKeyboard}>
                {children}
            </ContextMenuTrigger>
            <ContextMenuContent
                aria-label={`Task: ${task.text}`}
                onKeyDown={handleShortcut}
                onInteractOutside={() => {
                    closedFromOutside.current = true;
                }}
                // Back to the task's row, wherever an action moved it (when
                // it is gone, Radix falls back to the element that had focus).
                onCloseAutoFocus={(event) => {
                    const row = document.querySelector<HTMLElement>(
                        `[data-task-id="${CSS.escape(task.id)}"] button`,
                    );

                    if (row && !closedFromOutside.current) {
                        event.preventDefault();
                        row.focus();
                    }
                }}
                // As wide as the swatch grid: the items fit inside it.
                className="min-w-0"
            >
                <ContextMenuRadioGroup
                    aria-label="Task color"
                    value={task.color}
                    onValueChange={(value) => {
                        if (isTaskColor(value)) {
                            onColorChange(value);
                        }
                    }}
                    className="grid grid-cols-5 justify-items-center gap-1 px-1 pb-1"
                >
                    {TASK_COLORS.map((color) => (
                        <ContextMenuRadioItem
                            key={color}
                            value={color}
                            aria-label={TASK_COLOR_STYLES[color].label}
                            // The swatch carries the check: hide the item's
                            // own indicator (its first child).
                            className="size-8 justify-center rounded-full p-0 *:first:hidden"
                        >
                            <TaskColorSwatch
                                color={color}
                                checked={color === task.color}
                            />
                        </ContextMenuRadioItem>
                    ))}
                </ContextMenuRadioGroup>
                <ContextMenuSeparator />
                <ContextMenuItem
                    data-shortcut="task.nextDay"
                    onSelect={onMoveToTomorrow}
                >
                    Tomorrow
                    <MenuShortcut action="task.nextDay" />
                    <ArrowRight className="rtl:rotate-180" />
                </ContextMenuItem>
                <ContextMenuItem
                    data-shortcut="task.nextWeek"
                    onSelect={onMoveToNextWeek}
                >
                    Next week
                    <MenuShortcut action="task.nextWeek" />
                    <CalendarArrowUp />
                </ContextMenuItem>
                {task.date !== null && (
                    <ContextMenuItem
                        data-shortcut="task.someday"
                        onSelect={onMoveToSomeday}
                    >
                        Someday
                        <MenuShortcut action="task.someday" />
                        <ArrowDownToLine />
                    </ContextMenuItem>
                )}
                <ContextMenuItem
                    data-shortcut="task.duplicate"
                    onSelect={onDuplicate}
                >
                    Duplicate
                    <MenuShortcut action="task.duplicate" />
                    <Copy />
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem
                    variant="destructive"
                    data-shortcut="task.delete"
                    onSelect={onDelete}
                >
                    Delete
                    <MenuShortcut action="task.delete" />
                    <Trash2 />
                </ContextMenuItem>
            </ContextMenuContent>
        </ContextMenu>
    );
}
