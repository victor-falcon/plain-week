import { CircleCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Task } from '@/lib/db/types';
import { TASK_COLOR_STYLES } from '@/lib/planner/task-colors';
import { cn } from '@/lib/utils';

type Props = {
    task: Task;
    /** Opens the task (click, Enter or Space on its text). */
    onOpen: (taskId: string) => void;
    onToggleDone: (taskId: string) => void;
    className?: string;
};

/**
 * One ruled row showing a task: a button with the text that opens it, and a
 * check button at the end that toggles completion (on hover or focus with a
 * mouse on desktop, always on mobile and touch screens).
 */
export function TaskRow({ task, onOpen, onToggleDone, className }: Props) {
    const color = TASK_COLOR_STYLES[task.color];
    const label = [task.time, task.text, task.done ? '(done)' : null]
        .filter(Boolean)
        .join(' ');

    return (
        <div
            data-task-id={task.id}
            className={cn(
                'group/task flex h-row items-center gap-1 border-b border-border',
                task.done && 'text-muted-foreground',
                className,
            )}
        >
            <Button
                type="button"
                variant="ghost"
                aria-label={label}
                onClick={() => onOpen(task.id)}
                className="h-full min-w-0 flex-1 justify-start gap-0 rounded-none px-0 text-base font-normal text-inherit hover:bg-transparent hover:text-inherit focus-visible:rounded-sm active:not-aria-[haspopup]:translate-y-0 lg:text-sm"
            >
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
                        task.done && 'fill-muted-foreground text-background',
                    )}
                />
            </Button>
        </div>
    );
}
