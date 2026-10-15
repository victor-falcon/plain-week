import { createContext, use, useCallback, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { flushSync } from 'react-dom';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import type { Scope } from '@/lib/db/tasks';
import { needsScope } from '@/lib/planner/task-actions';
import type { PlannerTask } from '@/lib/recurrence/expand';

/** What the user is about to do to a recurring task. */
export type ScopeAction = 'edit' | 'delete' | 'repeat' | 'stop-repeating';

const COPY: Record<ScopeAction, { title: string; description: string }> = {
    edit: {
        title: 'Edit recurring task',
        description: 'Change only this task, or this one and every later one?',
    },
    delete: {
        title: 'Delete recurring task',
        description: 'Delete only this task, or this one and every later one?',
    },
    repeat: {
        title: 'Change repeat',
        description:
            'Apply the new repeat to only this task (it becomes a series of its own), or to this one and every later one?',
    },
    'stop-repeating': {
        title: 'Stop repeating',
        description:
            'Turn only this task into a one-off task, or stop the series from this task on?',
    },
};

type AskOptions = {
    /** The answer is kept for the next changes (the task dialog's edits). */
    remembered?: boolean;
};

/** Asks which tasks a change applies to; `null` when the user cancels. */
export type AskScope = (
    action: ScopeAction,
    options?: AskOptions,
) => Promise<Scope | null>;

type Prompt = AskOptions & { action: ScopeAction };

const ScopePromptContext = createContext<AskScope | null>(null);

/**
 * Hosts the "Only this task / This and all future" prompt for recurring tasks.
 * Mounted once by the planner page; `useScopePrompt()` asks.
 */
export function ScopePromptProvider({ children }: { children: ReactNode }) {
    const [open, setOpen] = useState(false);
    // Kept after closing, so the prompt keeps its text while it fades out.
    const [prompt, setPrompt] = useState<Prompt | null>(null);
    const resolver = useRef<((scope: Scope | null) => void) | null>(null);
    // The prompt has no trigger: focus goes back to where it was asked from
    // (the field being typed in), so typing carries on.
    const returnFocus = useRef<HTMLElement | null>(null);

    const ask = useCallback<AskScope>((action, options = {}) => {
        // A prompt still open is answered with "cancel".
        resolver.current?.(null);

        return new Promise((resolve) => {
            resolver.current = resolve;
            returnFocus.current =
                document.activeElement instanceof HTMLElement
                    ? document.activeElement
                    : null;
            setPrompt({ action, ...options });
            setOpen(true);
        });
    }, []);

    const answer = (scope: Scope | null) => {
        resolver.current?.(scope);
        resolver.current = null;
        // Closed synchronously so the focus trap is gone, then focus goes
        // back right away rather than after the closing animation: keys
        // typed just after answering land in the field.
        flushSync(() => setOpen(false));

        if (returnFocus.current?.isConnected) {
            returnFocus.current.focus();
        }
    };

    const copy = prompt ? COPY[prompt.action] : null;
    const destructive = prompt?.action === 'delete';

    return (
        <ScopePromptContext value={ask}>
            {children}
            <AlertDialog
                open={open}
                onOpenChange={(open) => !open && answer(null)}
            >
                {copy && (
                    <AlertDialogContent
                        onCloseAutoFocus={(event) => {
                            const target = returnFocus.current;

                            if (target?.isConnected) {
                                event.preventDefault();
                                target.focus();
                            }
                        }}
                    >
                        <AlertDialogHeader>
                            <AlertDialogTitle>{copy.title}</AlertDialogTitle>
                            <AlertDialogDescription>
                                {copy.description}
                                {prompt?.remembered &&
                                    ' Your answer applies to your other changes until you close the task.'}
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            {/*
                              Two answers: Radix's Action closes the prompt,
                              so each one resolves before it closes.
                            */}
                            <AlertDialogAction
                                variant="outline"
                                onClick={() => answer('future')}
                            >
                                This and all future
                            </AlertDialogAction>
                            <AlertDialogAction
                                variant={
                                    destructive ? 'destructive' : 'default'
                                }
                                onClick={() => answer('this')}
                            >
                                Only this task
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                )}
            </AlertDialog>
        </ScopePromptContext>
    );
}

/** The scope prompt of the closest `ScopePromptProvider`. */
export function useScopePrompt(): AskScope {
    const ask = use(ScopePromptContext);

    if (!ask) {
        throw new Error('useScopePrompt needs a ScopePromptProvider.');
    }

    return ask;
}

/**
 * Runs an action on `item`, first asking "Only this task / This and all
 * future" when the item has a scope (see `needsScope`). Cancelling the prompt
 * runs nothing; for a task without a scope, `run` gets `undefined`.
 */
export function useScopedAction(
    item: PlannerTask,
): (action: ScopeAction, run: (scope?: Scope) => unknown) => Promise<void> {
    const ask = useScopePrompt();

    return useCallback(
        async (action, run) => {
            const scope = (await needsScope(item))
                ? await ask(action)
                : undefined;

            if (scope !== null) {
                run(scope);
            }
        },
        [ask, item],
    );
}
