import { Plus, X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { v7 as uuidv7 } from 'uuid';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { updateSubtasks } from '@/lib/db/tasks';
import type { Subtask, Task } from '@/lib/db/types';
import { cn } from '@/lib/utils';
import { saveLocally } from '@/lib/planner/save-locally';

const FIELD_CLASS =
    'h-8 flex-1 rounded-none border-0 bg-transparent px-0 shadow-none focus-visible:ring-0 dark:bg-transparent';

/**
 * Subtasks: each with a checkbox, editable text and a delete button, then an
 * "Add subtask..." field that adds on Enter (and stays focused for the next),
 * when it loses focus, or when the dialog closes with text still in it.
 */
export function TaskSubtasks({ task }: { task: Task }) {
    const addInputRef = useRef<HTMLInputElement>(null);
    const change = (update: (subtasks: Subtask[]) => Subtask[]) =>
        saveLocally(updateSubtasks(task.id, update));

    const edit = (id: string, patch: Partial<Omit<Subtask, 'id'>>) =>
        change((subtasks) =>
            subtasks.map((subtask) =>
                subtask.id === id ? { ...subtask, ...patch } : subtask,
            ),
        );

    const remove = (id: string) =>
        change((subtasks) => subtasks.filter((subtask) => subtask.id !== id));

    const add = (input: HTMLInputElement) => {
        const text = input.value.trim();

        if (text === '') {
            return;
        }

        input.value = '';
        change((subtasks) => [
            ...subtasks,
            { id: uuidv7(), text, done: false },
        ]);
    };

    // Closing the dialog unmounts the field without a blur event.
    useEffect(() => {
        const input = addInputRef.current;

        return () => {
            if (input) {
                add(input);
            }
        };
        // `add` only needs the task id, which never changes for this dialog.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <ul className="flex flex-col">
            {task.subtasks.map((subtask) => (
                <li
                    key={subtask.id}
                    className="group/subtask flex items-center gap-2"
                >
                    <Checkbox
                        checked={subtask.done}
                        aria-label={`Complete "${subtask.text}"`}
                        onCheckedChange={(checked) =>
                            edit(subtask.id, { done: checked === true })
                        }
                        className="rounded-full"
                    />
                    <Input
                        aria-label="Subtask"
                        defaultValue={subtask.text}
                        onChange={(event) => {
                            const text = event.target.value;

                            if (text.trim() !== '') {
                                edit(subtask.id, { text });
                            }
                        }}
                        onKeyDown={(event) => {
                            if (
                                event.key === 'Enter' &&
                                !event.nativeEvent.isComposing
                            ) {
                                event.preventDefault();
                                addInputRef.current?.focus();
                            }
                        }}
                        onBlur={(event) => {
                            // Emptied: put the saved text back.
                            if (event.target.value.trim() === '') {
                                event.target.value = subtask.text;
                            }
                        }}
                        className={cn(
                            FIELD_CLASS,
                            subtask.done &&
                                'text-muted-foreground line-through',
                        )}
                    />
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        aria-label={`Delete "${subtask.text}"`}
                        onClick={() => remove(subtask.id)}
                        className="rounded-full text-muted-foreground pointer-fine:opacity-0 pointer-fine:group-focus-within/subtask:opacity-100 pointer-fine:group-hover/subtask:opacity-100"
                    >
                        <X />
                    </Button>
                </li>
            ))}
            <li className="flex items-center gap-2 text-muted-foreground">
                <Plus className="size-4 shrink-0" />
                <Input
                    ref={addInputRef}
                    aria-label="Add subtask"
                    onBlur={(event) => add(event.currentTarget)}
                    placeholder="Add subtask..."
                    enterKeyHint="enter"
                    onKeyDown={(event) => {
                        if (
                            event.key === 'Enter' &&
                            !event.nativeEvent.isComposing
                        ) {
                            event.preventDefault();
                            add(event.currentTarget);
                        }
                    }}
                    className={FIELD_CLASS}
                />
            </li>
        </ul>
    );
}
