import { useDroppable } from '@dnd-kit/core';
import {
    SortableContext,
    verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { Fragment, useLayoutEffect, useRef } from 'react';
import { toast } from 'sonner';
import { NewTaskRow } from '@/components/planner/new-task-row';
import {
    listDroppableId,
    usePlannerDnd,
} from '@/components/planner/planner-dnd';
import type { ListDropData } from '@/components/planner/planner-dnd';
import { TaskRow } from '@/components/planner/task-row';
import { createTask, toggleDone } from '@/lib/db/tasks';
import type { TaskPlacement } from '@/lib/db/tasks';
import type { Task } from '@/lib/db/types';
import { placementKey } from '@/lib/planner/drop';
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

/** The insertion line shown while a dragged task is over this spot. */
function DropIndicator() {
    return (
        <div data-drop-indicator className="relative h-0">
            <div className="absolute inset-x-0 -top-px z-[11] h-0.5 rounded-full bg-primary" />
        </div>
    );
}

/**
 * A ruled list: the tasks, then empty rows that add new ones. Empty rows are
 * keyed by their slot (row position), so adding a task only unmounts the row
 * it replaces and an input the user is in stays put. Creating with Enter moves
 * focus to the empty row right below the new task, so typing can go on.
 */
export function TaskList({
    placement,
    tasks,
    rows,
    newTaskLabel,
    onOpenTask,
    className,
}: Props) {
    const emptyInputs = useRef(new Map<number, HTMLInputElement>());
    const focusAfterCreate = useRef(false);
    const taskCount = tasks?.length ?? 0;
    const listKey = placementKey(placement);
    const listTasks = tasks ?? [];
    const { setNodeRef } = useDroppable({
        id: listDroppableId(listKey),
        data: {
            type: 'list',
            placement,
            tasks: listTasks,
        } satisfies ListDropData,
    });
    const { indicator } = usePlannerDnd();
    const indicatorBefore =
        indicator?.listKey === listKey ? indicator.beforeTaskId : undefined;
    const emptyRows = Math.max(rows, taskCount + 1) - taskCount;

    // When the row that had focus was replaced by its task (no empty row was
    // left below it), continue in the first empty row.
    useLayoutEffect(() => {
        if (!focusAfterCreate.current) {
            return;
        }

        focusAfterCreate.current = false;

        if (!document.activeElement?.closest('[data-new-task-row]')) {
            emptyInputs.current.get(taskCount)?.focus();
        }
    }, [taskCount]);

    const handleSubmit = (input: string, via: 'enter' | 'blur') => {
        const { text, time } = parseSmartTime(input);

        createTask({ ...placement, text, time }).catch(() =>
            toast.error(`Could not save "${input}".`),
        );

        if (via === 'enter') {
            // The new task takes the first empty slot; the next one stays.
            focusAfterCreate.current = true;
            emptyInputs.current.get(taskCount + 1)?.focus();
        }
    };

    const handleToggleDone = (taskId: string) => {
        toggleDone(taskId).catch(() =>
            toast.error('Could not update the task.'),
        );
    };

    return (
        <div
            ref={setNodeRef}
            data-list={listKey}
            className={cn('flex flex-col', className)}
        >
            <SortableContext
                items={listTasks.map((task) => task.id)}
                strategy={verticalListSortingStrategy}
            >
                {listTasks.map((task) => (
                    <Fragment key={task.id}>
                        {indicatorBefore === task.id && <DropIndicator />}
                        <TaskRow
                            task={task}
                            placement={placement}
                            tasks={listTasks}
                            onOpen={onOpenTask}
                            onToggleDone={handleToggleDone}
                        />
                    </Fragment>
                ))}
            </SortableContext>
            {indicatorBefore === null && <DropIndicator />}
            {Array.from({ length: emptyRows }, (_, index) => {
                const slot = taskCount + index;

                return (
                    <NewTaskRow
                        key={`new-${slot}`}
                        ref={(input) => {
                            if (input) {
                                emptyInputs.current.set(slot, input);
                            }

                            return () => {
                                emptyInputs.current.delete(slot);
                            };
                        }}
                        label={newTaskLabel}
                        onSubmit={handleSubmit}
                        className={index > 0 ? 'max-lg:hidden' : undefined}
                    />
                );
            })}
        </div>
    );
}
