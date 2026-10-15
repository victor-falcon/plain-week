import { createContext, use, useCallback, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useScopePrompt } from '@/components/planner/scope-prompt';
import type { ScopeAction } from '@/components/planner/scope-prompt';
import { useSeries, useTask } from '@/hooks/use-tasks';
import type { Scope } from '@/lib/db/tasks';
import type { Task } from '@/lib/db/types';
import type { PlannerTask, SeriesItem } from '@/lib/recurrence/expand';

type WriteOptions<T> = {
    /**
     * The write returns the item that now stands for the task (an occurrence's
     * exception, the new series after a "this and all future" change): the
     * dialog switches to it, so it never shows a task id that has ended.
     */
    follow?: boolean;
    /** Toast shown when the write fails. */
    error?: string;
    /** Runs once the write is committed. */
    onSaved?: (result: T) => void;
};

/** A change whose scope the user may be asked for, written with `scope`. */
type ScopedWrite = (id: string, scope?: Scope) => Promise<PlannerTask>;

export type TaskEditor = {
    /** The item shown (the last one loaded while the next id loads). */
    task: PlannerTask;
    /** Its live series; `null` for a plain task, `undefined` while loading. */
    series: SeriesItem | null | undefined;
    /** Whether changes to it can apply to "this" or "this and all future". */
    recurring: boolean;
    /**
     * Writes a change that never asks for a scope (done, moves, duplicate).
     * Writes run one after the other, each on the id the previous one left.
     */
    write: <T>(
        run: (id: string) => Promise<T>,
        options?: WriteOptions<T>,
    ) => void;
    /**
     * Writes a scoped edit (text, notes, color, time, subtasks). On a
     * recurring task the first one asks "Only this task / This and all
     * future" and the answer is kept until the dialog closes; `onCancel` runs
     * when the user dismisses the question.
     */
    edit: (run: ScopedWrite, options?: { onCancel?: () => void }) => void;
    /** Asks the scope of a one-off action every time (delete, stop repeating). */
    askScope: (action: ScopeAction) => Promise<Scope | null | undefined>;
};

const TaskEditorContext = createContext<TaskEditor | null>(null);

export const TaskEditorProvider = TaskEditorContext;

/** The editor of the open task dialog. */
export function useTaskEditor(): TaskEditor {
    const editor = use(TaskEditorContext);

    if (!editor) {
        throw new Error('useTaskEditor needs the task dialog.');
    }

    return editor;
}

function hasId(value: unknown): value is { id: string } {
    return (
        typeof value === 'object' &&
        value !== null &&
        typeof (value as Task).id === 'string'
    );
}

/**
 * State of one open task dialog: the id it shows, which follows the ids the
 * repository returns, the queue of its writes, and the remembered scope.
 *
 * `task` is `null` once the task is gone (deleted here or on another device)
 * and no write of this dialog is still running; `undefined` while loading.
 */
export function useTaskEditorSession(openedId: string): {
    editor: TaskEditor | undefined;
    task: PlannerTask | null | undefined;
} {
    const ask = useScopePrompt();
    const [id, setId] = useState(openedId);
    const [pending, setPending] = useState(0);
    const live = useTask(id);
    // While a new id loads, or while a write is about to hand over a new id,
    // keep showing the last item instead of an empty or closed dialog.
    const [kept, setKept] = useState<PlannerTask | undefined>(undefined);

    if (live && live !== kept) {
        setKept(live);
    }

    const task = live ?? (live === null && pending === 0 ? null : kept);
    const series = useSeries(task);
    const recurring =
        task?.kind === 'occurrence' ||
        (task?.kind === 'exception' && series !== null);

    const latestId = useRef(openedId);
    const queue = useRef<Promise<void>>(Promise.resolve());
    const scopeChoice = useRef<Promise<Scope | null> | null>(null);

    const write = useCallback(
        <T,>(
            run: (id: string) => Promise<T>,
            { follow = false, error, onSaved }: WriteOptions<T> = {},
        ) => {
            setPending((count) => count + 1);
            queue.current = queue.current
                .then(() => run(latestId.current))
                .then(
                    (result) => {
                        if (follow && hasId(result)) {
                            latestId.current = result.id;
                            setId(result.id);
                        }

                        onSaved?.(result);
                    },
                    () => {
                        toast.error(error ?? 'Could not update the task.');
                    },
                )
                .finally(() => setPending((count) => count - 1));
        },
        [],
    );

    const edit = useCallback<TaskEditor['edit']>(
        (run, { onCancel } = {}) => {
            if (!recurring) {
                write((current) => run(current), { follow: true });

                return;
            }

            // Asked once; edits made while the question is open wait for it.
            scopeChoice.current ??= ask('edit').then((scope) => {
                if (scope === null) {
                    scopeChoice.current = null;
                }

                return scope;
            });

            void scopeChoice.current.then((scope) => {
                if (scope === null) {
                    onCancel?.();
                } else {
                    write((current) => run(current, scope), { follow: true });
                }
            });
        },
        [ask, recurring, write],
    );

    const askScope = useCallback<TaskEditor['askScope']>(
        async (action) => (recurring ? ask(action) : undefined),
        [ask, recurring],
    );

    return {
        task,
        editor: task
            ? { task, series, recurring, write, edit, askScope }
            : undefined,
    };
}
