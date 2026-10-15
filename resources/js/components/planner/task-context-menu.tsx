import {
    ArrowDownToLine,
    ArrowRight,
    CalendarArrowUp,
    Copy,
    Trash2,
} from 'lucide-react';
import { useRef } from 'react';
import type { KeyboardEvent, ReactElement } from 'react';
import { TaskColorSwatch } from '@/components/planner/task-color-swatch';
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuRadioGroup,
    ContextMenuRadioItem,
    ContextMenuSeparator,
    ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { TASK_COLORS } from '@/lib/db/types';
import type { Task, TaskColor } from '@/lib/db/types';
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
                    className="grid grid-cols-5 gap-1 px-1 pb-1"
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
                <ContextMenuItem onSelect={onMoveToTomorrow}>
                    Tomorrow
                    <ArrowRight className="ms-auto rtl:rotate-180" />
                </ContextMenuItem>
                <ContextMenuItem onSelect={onMoveToNextWeek}>
                    Next week
                    <CalendarArrowUp className="ms-auto" />
                </ContextMenuItem>
                {task.date !== null && (
                    <ContextMenuItem onSelect={onMoveToSomeday}>
                        Someday
                        <ArrowDownToLine className="ms-auto" />
                    </ContextMenuItem>
                )}
                <ContextMenuItem onSelect={onDuplicate}>
                    Duplicate
                    <Copy className="ms-auto" />
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem variant="destructive" onSelect={onDelete}>
                    Delete
                    <Trash2 className="ms-auto" />
                </ContextMenuItem>
            </ContextMenuContent>
        </ContextMenu>
    );
}
