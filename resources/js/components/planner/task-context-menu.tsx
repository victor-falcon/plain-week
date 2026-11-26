import {
    ArrowDownToLine,
    ArrowRight,
    CalendarArrowUp,
    Copy,
    EllipsisVertical,
    Trash2,
} from 'lucide-react';
import { useRef } from 'react';
import type {
    ComponentType,
    KeyboardEvent,
    ReactElement,
    ReactNode,
} from 'react';
import { ShortcutHint } from '@/components/planner/shortcut-hint';
import { TaskColorSwatch } from '@/components/planner/task-color-swatch';
import { Button } from '@/components/ui/button';
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
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuSeparator,
    DropdownMenuShortcut,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useMenuShortcuts } from '@/hooks/use-menu-shortcuts';
import { useTaskColorName } from '@/hooks/use-task-labels';
import { t } from '@/lib/i18n';
import { TASK_COLORS } from '@/lib/db/types';
import type { Task, TaskColor } from '@/lib/db/types';
import type { ShortcutId } from '@/lib/planner/shortcuts';
import { isTaskColor } from '@/lib/planner/task-colors';
import { cn } from '@/lib/utils';

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

type ItemProps = {
    onSelect?: () => void;
    variant?: 'default' | 'destructive';
    'data-shortcut'?: ShortcutId;
    children: ReactNode;
};

/**
 * The shadcn parts the task menu's items are built from: the context menu's
 * (right click) or the dropdown menu's (the row's "more" button). Both are
 * Radix menus, but each only accepts its own items.
 */
type MenuParts = {
    RadioGroup: ComponentType<{
        'aria-label': string;
        value: string;
        onValueChange: (value: string) => void;
        className?: string;
        children: ReactNode;
    }>;
    RadioItem: ComponentType<{
        value: string;
        'aria-label': string;
        className?: string;
        children: ReactNode;
    }>;
    Item: ComponentType<ItemProps>;
    Separator: ComponentType;
    Shortcut: ComponentType<{ children: ReactNode }>;
};

const CONTEXT_MENU_PARTS: MenuParts = {
    RadioGroup: ContextMenuRadioGroup,
    RadioItem: ContextMenuRadioItem,
    Item: ContextMenuItem,
    Separator: ContextMenuSeparator,
    Shortcut: ContextMenuShortcut,
};

const DROPDOWN_MENU_PARTS: MenuParts = {
    RadioGroup: DropdownMenuRadioGroup,
    RadioItem: DropdownMenuRadioItem,
    Item: DropdownMenuItem,
    Separator: DropdownMenuSeparator,
    Shortcut: DropdownMenuShortcut,
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
 * The task menu's items, the same in the context menu and the "more" button's
 * dropdown: the nine color swatches in two rows (five and four, like the
 * dialog's color picker; each named after its label, in a tooltip), the
 * quick moves, Duplicate and Delete. Each item shows its key before its icon;
 * the key's slot stays (empty on touch devices) so the icon keeps its place
 * at the end.
 */
function TaskMenuItems({
    task,
    parts: { RadioGroup, RadioItem, Item, Separator, Shortcut },
    onColorChange,
    onMoveToTomorrow,
    onMoveToNextWeek,
    onMoveToSomeday,
    onDuplicate,
    onDelete,
}: TaskContextMenuActions & { task: Task; parts: MenuParts }) {
    const colorName = useTaskColorName();
    const hint = (action: ShortcutId) => (
        <Shortcut>
            <ShortcutHint action={action} />
        </Shortcut>
    );

    return (
        <>
            <RadioGroup
                aria-label={t('planner.taskColor')}
                value={task.color}
                onValueChange={(value) => {
                    if (isTaskColor(value)) {
                        onColorChange(value);
                    }
                }}
                className="grid grid-cols-5 justify-items-center gap-1 px-1 pb-1"
            >
                {TASK_COLORS.map((color) => (
                    <RadioItem
                        key={color}
                        value={color}
                        aria-label={colorName(color)}
                        // The swatch carries the check: hide the item's own
                        // indicator (its first child).
                        className="size-8 justify-center rounded-full p-0 *:first:hidden"
                    >
                        <TaskColorSwatch
                            color={color}
                            checked={color === task.color}
                            label={colorName(color)}
                        />
                    </RadioItem>
                ))}
            </RadioGroup>
            <Separator />
            <Item data-shortcut="task.nextDay" onSelect={onMoveToTomorrow}>
                {t('planner.tomorrow')}
                {hint('task.nextDay')}
                <ArrowRight className="rtl:rotate-180" />
            </Item>
            <Item data-shortcut="task.nextWeek" onSelect={onMoveToNextWeek}>
                {t('planner.nextWeekMove')}
                {hint('task.nextWeek')}
                <CalendarArrowUp />
            </Item>
            {task.date !== null && (
                <Item data-shortcut="task.someday" onSelect={onMoveToSomeday}>
                    {t('planner.someday')}
                    {hint('task.someday')}
                    <ArrowDownToLine />
                </Item>
            )}
            <Item data-shortcut="task.duplicate" onSelect={onDuplicate}>
                {t('planner.duplicate')}
                {hint('task.duplicate')}
                <Copy />
            </Item>
            <Separator />
            <Item
                variant="destructive"
                data-shortcut="task.delete"
                onSelect={onDelete}
            >
                {t('common.delete')}
                {hint('task.delete')}
                <Trash2 />
            </Item>
        </>
    );
}

/**
 * The context menu of a task row: right click on desktop, or Shift+F10 / the
 * context menu key on a focused row. A long press on a touch screen does not
 * open it (the row keeps that press for dragging, see `TaskRow`); touch users
 * get the same items from the row's "more" button (`TaskMenuButton`). The
 * actions are props so callers decide what each one does.
 */
/**
 * Focus when a task menu closes: back to the task's row, wherever an action
 * moved it (when it is gone, Radix falls back to the element that had focus),
 * unless a press elsewhere closed it: focus stays where that press put it.
 * Returns the props for the menu's root and content.
 */
function useTaskMenuFocus(task: Task) {
    const closedFromOutside = useRef(false);

    return {
        onOpenChange: (open: boolean) => {
            if (open) {
                closedFromOutside.current = false;
            }
        },
        onInteractOutside: () => {
            closedFromOutside.current = true;
        },
        onCloseAutoFocus: (event: Event) => {
            const row = document.querySelector<HTMLElement>(
                `[data-task-id="${CSS.escape(task.id)}"] button`,
            );

            if (row && !closedFromOutside.current) {
                event.preventDefault();
                row.focus();
            }
        },
    };
}

export function TaskContextMenu({ task, children, ...actions }: Props) {
    const { onOpenChange, ...focusProps } = useTaskMenuFocus(task);
    const handleShortcut = useMenuShortcuts(MENU_SHORTCUTS);

    return (
        <ContextMenu onOpenChange={onOpenChange}>
            <ContextMenuTrigger asChild onKeyDown={openFromKeyboard}>
                {children}
            </ContextMenuTrigger>
            <ContextMenuContent
                aria-label={t('planner.taskMenu', { text: task.text })}
                onKeyDown={handleShortcut}
                {...focusProps}
                // As wide as the swatch grid: the items fit inside it.
                className="min-w-0"
            >
                <TaskMenuItems
                    task={task}
                    parts={CONTEXT_MENU_PARTS}
                    {...actions}
                />
            </ContextMenuContent>
        </ContextMenu>
    );
}

/**
 * The row's quiet "more" button (⋮) at its end, opening the task menu's items
 * as a dropdown: the way to reach them on a touch screen, where a long press
 * drags the task instead. Shown below `lg` and on any device with a touch
 * screen (a touch laptop too); hidden on desktops with only a mouse or
 * trackpad, whose users right click.
 *
 * Pressing it must not pick the task up: it stops the press from reaching
 * the row's drag listeners.
 */
export function TaskMenuButton({
    task,
    className,
    ...actions
}: TaskContextMenuActions & { task: Task; className?: string }) {
    const { onOpenChange, ...focusProps } = useTaskMenuFocus(task);
    const handleShortcut = useMenuShortcuts(MENU_SHORTCUTS);

    return (
        <DropdownMenu onOpenChange={onOpenChange}>
            <DropdownMenuTrigger asChild>
                <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t('planner.moreTaskActions', {
                        text: task.text,
                    })}
                    onTouchStart={(event) => event.stopPropagation()}
                    onMouseDown={(event) => event.stopPropagation()}
                    className={cn(
                        'mt-1 shrink-0 rounded-full text-muted-foreground hover:bg-transparent lg:pointer-fine:not-any-pointer-coarse:hidden',
                        className,
                    )}
                >
                    <EllipsisVertical className="size-4" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
                align="end"
                // Named like the context menu, not after its trigger.
                aria-labelledby={undefined}
                aria-label={t('planner.taskMenu', { text: task.text })}
                onKeyDown={handleShortcut}
                {...focusProps}
                // As wide as the swatch grid: the items fit inside it.
                className="w-auto min-w-0"
            >
                <TaskMenuItems
                    task={task}
                    parts={DROPDOWN_MENU_PARTS}
                    {...actions}
                />
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
