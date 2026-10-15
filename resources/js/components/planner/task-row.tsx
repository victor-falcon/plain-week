import { CircleCheck } from 'lucide-react';
import type { KeyboardEvent } from 'react';
import { Button } from '@/components/ui/button';
import type { Task } from '@/lib/db/types';
import { TASK_COLOR_STYLES } from '@/lib/planner/task-colors';
import { cn } from '@/lib/utils';

type Props = {
    task: Task;
    /** Opens the task (single click, Enter or Space). */
    onOpen: (taskId: string) => void;
    onToggleDone: (taskId: string) => void;
    className?: string;
};

/**
 * One ruled row showing a task. Clicking the row opens it; the check button at
 * the end toggles completion (on hover or focus on desktop, always on touch
 * layouts).
 */
export function TaskRow({ task, onOpen, onToggleDone, className }: Props) {
    const color = TASK_COLOR_STYLES[task.color];

    const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        if (
            event.target === event.currentTarget &&
            (event.key === 'Enter' || event.key === ' ')
        ) {
            event.preventDefault();
            onOpen(task.id);
        }
    };

    return (
        <div
            role="button"
            tabIndex={0}
            data-task-id={task.id}
            aria-label={task.time ? `${task.time} ${task.text}` : task.text}
            onClick={() => onOpen(task.id)}
            onKeyDown={handleKeyDown}
            className={cn(
                'group/task flex h-row cursor-pointer items-center gap-1 border-b border-border text-base outline-none focus-visible:ring-3 focus-visible:ring-ring/30 lg:text-sm',
                task.done && 'text-muted-foreground',
                className,
            )}
        >
            <span
                className={cn(
                    'flex min-w-0 flex-1 items-center truncate',
                    task.done && 'line-through',
                )}
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
                        task.done && color.pill && 'opacity-50',
                    )}
                >
                    {task.text}
                </span>
            </span>
            <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={task.done ? 'Mark as not done' : 'Mark as done'}
                aria-pressed={task.done}
                onClick={(event) => {
                    event.stopPropagation();
                    onToggleDone(task.id);
                }}
                onKeyDown={(event) => event.stopPropagation()}
                className={cn(
                    'shrink-0 rounded-full hover:bg-transparent focus-visible:opacity-100 lg:opacity-0 lg:group-hover/task:opacity-100 lg:group-focus-visible/task:opacity-100',
                    task.done && 'lg:opacity-100',
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
