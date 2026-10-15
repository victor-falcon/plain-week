import { useSortable } from '@dnd-kit/sortable';
import { CircleCheck, GripVertical } from 'lucide-react';
import { usePlannerDnd } from '@/components/planner/planner-dnd';
import { TaskContextMenu } from '@/components/planner/task-context-menu';
import { Button } from '@/components/ui/button';
import type { TaskPlacement } from '@/lib/db/tasks';
import type { Task } from '@/lib/db/types';
import type { TaskDragData } from '@/lib/planner/drop';
import {
    deleteWithUndo,
    duplicateWithToast,
    moveToNextWeek,
    moveToSomeday,
    moveToTomorrow,
    setTaskColor,
} from '@/lib/planner/task-actions';
import { TASK_COLOR_STYLES } from '@/lib/planner/task-colors';
import { cn } from '@/lib/utils';

type Props = {
    task: Task;
    /** The list the row is in, and its tasks in display order (for drops). */
    placement: TaskPlacement;
    tasks: Task[];
    /** Opens the task (click, Enter or Space on its text). */
    onOpen: (taskId: string) => void;
    onToggleDone: (taskId: string) => void;
    className?: string;
};

/** The task's time pill and text pill, as shown in a row (and the drag overlay). */
export function TaskLabel({ task }: { task: Task }) {
    const color = TASK_COLOR_STYLES[task.color];

    return (
        <>
            {task.time && (
                <span className="ms-1.5 shrink-0 rounded-full border border-current px-1.5 text-xs leading-5 tabular-nums">
                    {task.time}
                </span>
            )}
            <span
                className={cn(
                    'truncate rounded-full px-1.5 leading-6',
                    color.pill,
                    task.done && 'line-through',
                    task.done && color.pill && 'opacity-50',
                )}
            >
                {task.text}
            </span>
        </>
    );
}

/**
 * One ruled row showing a task: a button with the text that opens it, and a
 * check button at the end that toggles completion (on hover or focus with a
 * mouse on desktop, always on mobile and touch screens).
 *
 * The whole row is draggable (mouse: after 5px of movement, so a click still
 * opens the task; touch: press, hold and move). For keyboard users a move
 * button, visible only while focused, picks the task up with Space or Enter.
 *
 * Right click, Shift+F10 / the context menu key, or a still touch hold open
 * the task's context menu.
 */
export function TaskRow({
    task,
    placement,
    tasks,
    onOpen,
    onToggleDone,
    className,
}: Props) {
    const label = [task.time, task.text, task.done ? '(done)' : null]
        .filter(Boolean)
        .join(' ');
    const { setNodeRef, setActivatorNodeRef, listeners, attributes } =
        useSortable({
            id: task.id,
            data: {
                type: 'task',
                task,
                placement,
                tasks,
            } satisfies TaskDragData,
            attributes: { roleDescription: 'movable task' },
        });
    // Dimmed while dragged, and until the drop has been written.
    const isDragging = usePlannerDnd().activeId === task.id;

    return (
        <TaskContextMenu
            task={task}
            onColorChange={(color) => setTaskColor(task, color)}
            onMoveToTomorrow={() => moveToTomorrow(task)}
            onMoveToNextWeek={() => moveToNextWeek(task)}
            onMoveToSomeday={() => moveToSomeday(task)}
            onDuplicate={() => duplicateWithToast(task)}
            onDelete={() => deleteWithUndo(task)}
        >
            <div
                ref={setNodeRef}
                data-task-id={task.id}
                {...listeners}
                onContextMenu={(event) => {
                    // No menu for the task being dragged (a touch drag may make
                    // the browser send a long-press contextmenu).
                    if (isDragging) {
                        event.preventDefault();
                    }
                }}
                className={cn(
                    'group/task relative flex h-row items-center gap-1 border-b border-border select-none [-webkit-touch-callout:none]',
                    task.done && 'text-muted-foreground',
                    isDragging && 'opacity-40',
                    className,
                )}
            >
                <Button
                    type="button"
                    variant="ghost"
                    aria-label={label}
                    onClick={() => onOpen(task.id)}
                    // The focus ring is drawn over the whole row (the row is the
                    // positioned parent), not just the text button.
                    className="h-full min-w-0 flex-1 justify-start gap-0 rounded-none px-0 text-base font-normal text-inherit after:pointer-events-none after:absolute after:inset-0 after:rounded-sm after:border after:border-transparent hover:bg-transparent hover:text-inherit focus-visible:border-transparent focus-visible:ring-0 focus-visible:after:border-ring focus-visible:after:ring-3 focus-visible:after:ring-ring/30 active:not-aria-[haspopup]:translate-y-0 lg:text-sm"
                >
                    <TaskLabel task={task} />
                </Button>
                <Button
                    ref={setActivatorNodeRef}
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    {...attributes}
                    aria-label={`Move ${task.text}`}
                    className="sr-only shrink-0 rounded-full hover:bg-transparent focus-visible:not-sr-only"
                >
                    <GripVertical className="size-5" />
                </Button>
                <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={task.done ? 'Mark as not done' : 'Mark as done'}
                    aria-pressed={task.done}
                    onClick={() => onToggleDone(task.id)}
                    className={cn(
                        // Hidden until hover only for mouse users on desktop; touch
                        // screens of any size always show it.
                        'shrink-0 rounded-full hover:bg-transparent lg:pointer-fine:opacity-0 lg:pointer-fine:group-hover/task:opacity-100 lg:pointer-fine:focus-visible:opacity-100',
                        task.done && 'lg:pointer-fine:opacity-100',
                    )}
                >
                    <CircleCheck
                        className={cn(
                            'size-5',
                            task.done &&
                                'fill-muted-foreground text-background',
                        )}
                    />
                </Button>
            </div>
        </TaskContextMenu>
    );
}
