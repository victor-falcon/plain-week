import { CircleCheck, Trash2 } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { useTask } from '@/hooks/use-tasks';
import {
    deleteTask,
    restoreTask,
    toggleDone,
    updateTask,
} from '@/lib/db/tasks';
import type { Task } from '@/lib/db/types';
import { cn } from '@/lib/utils';
import { TaskColorPicker } from './task-color-picker';
import { TaskDatePicker } from './task-date-picker';
import { TaskMoreMenu } from './task-more-menu';
import { TaskSubtasks } from './task-subtasks';
import { TaskTimePicker } from './task-time-picker';
import { saveLocally } from './save-locally';
import { TOOLBAR_BUTTON_CLASS, ToolbarTooltip } from './toolbar-tooltip';

type Props = {
    /** The task to show; null keeps the dialog closed. */
    taskId: string | null;
    onClose: () => void;
};

/**
 * The task dialog. Every edit is written to the local database as it happens
 * (no save button, no network); Esc or a click outside closes it.
 */
export function TaskDialog({ taskId, onClose }: Props) {
    const task = useTask(taskId);

    // Deleted here or on another device (through sync): nothing left to edit.
    useEffect(() => {
        if (taskId !== null && task === null) {
            onClose();
        }
    }, [taskId, task, onClose]);

    return (
        <Dialog
            open={taskId !== null && task !== null}
            onOpenChange={(open) => !open && onClose()}
        >
            {task && (
                <TaskDialogContent
                    key={task.id}
                    task={task}
                    onClose={onClose}
                />
            )}
        </Dialog>
    );
}

function TaskDialogContent({
    task,
    onClose,
}: {
    task: Task;
    onClose: () => void;
}) {
    const contentRef = useRef<HTMLDivElement>(null);
    const notesRef = useRef<HTMLTextAreaElement>(null);

    const handleDelete = () => {
        saveLocally(deleteTask(task.id), {
            error: 'Could not delete the task.',
            onSaved: () => {
                onClose();
                toast('Task deleted.', {
                    action: {
                        label: 'Undo',
                        onClick: () =>
                            saveLocally(restoreTask(task.id), {
                                error: 'Could not restore the task.',
                            }),
                    },
                });
            },
        });
    };

    return (
        <DialogContent
            ref={contentRef}
            showCloseButton={false}
            aria-describedby={undefined}
            // Focus the dialog itself: no tooltip pops up and no on-screen
            // keyboard opens on touch devices.
            onOpenAutoFocus={(event) => {
                event.preventDefault();
                contentRef.current?.focus();
            }}
            // Back to the task's row, which may have moved to another day
            // since it opened the dialog (when it is not shown, Radix falls
            // back to the element that had focus).
            onCloseAutoFocus={(event) => {
                const row = document.querySelector<HTMLElement>(
                    `[data-task-id="${task.id}"] button`,
                );

                if (row) {
                    event.preventDefault();
                    row.focus();
                }
            }}
            className="top-4 max-h-[calc(100dvh-2rem)] translate-y-0 gap-4 overflow-y-auto bg-secondary p-4 text-secondary-foreground sm:top-16 sm:max-h-[calc(100dvh-8rem)] sm:max-w-lg sm:p-6"
        >
            <DialogTitle className="sr-only">Edit task</DialogTitle>
            <div className="-mx-2 -mt-1 flex min-w-0 items-center gap-1">
                <TaskDatePicker task={task} />
                <TaskTimePicker task={task} />
                <div className="ms-auto flex items-center gap-1">
                    <ToolbarTooltip label="Delete">
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            aria-label="Delete"
                            onClick={handleDelete}
                            className={TOOLBAR_BUTTON_CLASS}
                        >
                            <Trash2 />
                        </Button>
                    </ToolbarTooltip>
                    <TaskColorPicker task={task} />
                    <TaskMoreMenu task={task} />
                </div>
            </div>
            {/*
              The text fields are uncontrolled (the dialog remounts per task):
              typing never waits on the database round trip, and a remote edit
              of the same field made while the dialog is open shows next time.
            */}
            <div className="mt-6 flex items-start gap-2 border-b border-foreground/30 pb-1">
                <Textarea
                    aria-label="Task"
                    defaultValue={task.text}
                    rows={1}
                    onChange={(event) => {
                        // The title is one line: pasted line breaks become
                        // spaces.
                        if (/[\r\n]/.test(event.target.value)) {
                            event.target.value = event.target.value.replace(
                                /\s*[\r\n]+\s*/g,
                                ' ',
                            );
                        }

                        const text = event.target.value;

                        if (text.trim() !== '') {
                            saveLocally(updateTask(task.id, { text }));
                        }
                    }}
                    onBlur={(event) => {
                        // A task always has text: put the saved text back.
                        if (event.target.value.trim() === '') {
                            event.target.value = task.text;
                        }
                    }}
                    onKeyDown={(event) => {
                        // The title is one paragraph: Enter moves on to notes.
                        if (
                            event.key === 'Enter' &&
                            !event.nativeEvent.isComposing
                        ) {
                            event.preventDefault();
                            notesRef.current?.focus();
                        }
                    }}
                    className={cn(
                        'min-h-0 rounded-none border-0 bg-transparent p-0 text-2xl leading-snug font-medium shadow-none focus-visible:ring-0 md:text-2xl dark:bg-transparent',
                        task.done && 'text-muted-foreground line-through',
                    )}
                />
                <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={task.done ? 'Mark as not done' : 'Mark as done'}
                    aria-pressed={task.done}
                    onClick={() => saveLocally(toggleDone(task.id))}
                    className="mt-0.5 shrink-0 rounded-full hover:bg-transparent"
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
            <Textarea
                ref={notesRef}
                aria-label="Notes"
                placeholder="Add some extra notes here…"
                defaultValue={task.notes}
                onChange={(event) =>
                    saveLocally(
                        updateTask(task.id, { notes: event.target.value }),
                    )
                }
                className="min-h-10 rounded-none border-0 bg-transparent p-0 shadow-none focus-visible:ring-0 dark:bg-transparent"
            />
            <TaskSubtasks task={task} />
        </DialogContent>
    );
}
