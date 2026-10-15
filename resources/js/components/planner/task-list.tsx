import { useRef } from 'react';
import { toast } from 'sonner';
import { NewTaskRow } from '@/components/planner/new-task-row';
import { TaskRow } from '@/components/planner/task-row';
import { createTask, toggleDone } from '@/lib/db/tasks';
import type { TaskPlacement } from '@/lib/db/tasks';
import type { Task } from '@/lib/db/types';
import { parseSmartTime } from '@/lib/planner/smart-time';
import { cn } from '@/lib/utils';

type Props = {
    /** The day or Someday column this list shows. */
    placement: TaskPlacement;
    /** Sorted tasks; `undefined` while the first local read is in progress. */
    tasks: Task[] | undefined;
    /** Ruled rows to fill on desktop. Mobile shows a single empty row. */
    rows: number;
    /** Accessible label of the empty rows, e.g. "New task for Mon 12 Oct". */
    newTaskLabel: string;
    onOpenTask: (taskId: string) => void;
    className?: string;
};

/**
 * A ruled list: the tasks, then empty rows that add new ones. Creating with
 * Enter keeps focus on the first empty row, which lands right below the new
 * task, so typing can go on.
 */
export function TaskList({
    placement,
    tasks,
    rows,
    newTaskLabel,
    onOpenTask,
    className,
}: Props) {
    const firstEmptyRow = useRef<HTMLInputElement>(null);
    const taskCount = tasks?.length ?? 0;
    const emptyRows = Math.max(rows, taskCount + 1) - taskCount;

    const handleSubmit = (input: string, via: 'enter' | 'blur') => {
        const { text, time } = parseSmartTime(input);

        createTask({ ...placement, text, time }).catch(() =>
            toast.error('Could not save the task.'),
        );

        if (via === 'enter') {
            firstEmptyRow.current?.focus();
        }
    };

    const handleToggleDone = (taskId: string) => {
        toggleDone(taskId).catch(() =>
            toast.error('Could not update the task.'),
        );
    };

    return (
        <div className={cn('flex flex-col', className)}>
            {tasks?.map((task) => (
                <TaskRow
                    key={task.id}
                    task={task}
                    onOpen={onOpenTask}
                    onToggleDone={handleToggleDone}
                />
            ))}
            {Array.from({ length: emptyRows }, (_, index) => (
                <NewTaskRow
                    key={`new-${index}`}
                    ref={index === 0 ? firstEmptyRow : undefined}
                    label={newTaskLabel}
                    onSubmit={handleSubmit}
                    className={index > 0 ? 'max-lg:hidden' : undefined}
                />
            ))}
        </div>
    );
}
