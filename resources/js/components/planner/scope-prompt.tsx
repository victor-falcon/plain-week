import { createContext, use, useCallback, useRef, useState } from 'react';
import type { ReactNode } from 'react';
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
export type ScopeAction = 'edit' | 'delete' | 'stop-repeating';

const COPY: Record<ScopeAction, { title: string; description: string }> = {
    edit: {
        title: 'Edit recurring task',
        description:
            'Change only this task, or this one and every later one? Your choice applies to the rest of your changes until the task is closed.',
    },
    delete: {
        title: 'Delete recurring task',
        description: 'Delete only this task, or this one and every later one?',
    },
    'stop-repeating': {
        title: 'Stop repeating',
        description:
            'Turn only this task into a one-off task, or stop the series from this task on?',
    },
};

/** Asks which tasks a change applies to; `null` when the user cancels. */
export type AskScope = (action: ScopeAction) => Promise<Scope | null>;

const ScopePromptContext = createContext<AskScope | null>(null);

/**
 * Hosts the "Only this task / This and all future" prompt for recurring tasks.
 * Mounted once by the planner page; `useScopePrompt()` asks.
 */
export function ScopePromptProvider({ children }: { children: ReactNode }) {
    const [action, setAction] = useState<ScopeAction | null>(null);
    const resolver = useRef<((scope: Scope | null) => void) | null>(null);

    const ask = useCallback<AskScope>((next) => {
        // A prompt still open is answered with "cancel".
        resolver.current?.(null);

        return new Promise((resolve) => {
            resolver.current = resolve;
            setAction(next);
        });
    }, []);

    const answer = (scope: Scope | null) => {
        resolver.current?.(scope);
        resolver.current = null;
        setAction(null);
    };

    const copy = action ? COPY[action] : null;
    const destructive = action === 'delete';

    return (
        <ScopePromptContext value={ask}>
            {children}
            <AlertDialog
                open={action !== null}
                onOpenChange={(open) => !open && answer(null)}
            >
                {copy && (
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>{copy.title}</AlertDialogTitle>
                            <AlertDialogDescription>
                                {copy.description}
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
 * Asks the scope of a change to `item` only when it has one (see
 * `needsScope`): resolves with the chosen scope, `undefined` when there was
 * nothing to ask, or `null` when the user cancelled.
 */
export function useScopeFor(): (
    item: PlannerTask,
    action: ScopeAction,
) => Promise<Scope | null | undefined> {
    const ask = useScopePrompt();

    return useCallback(
        async (item, action) =>
            (await needsScope(item)) ? ask(action) : undefined,
        [ask],
    );
}
