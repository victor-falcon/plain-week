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
import { t } from '@/lib/i18n';
import { needsScope } from '@/lib/planner/task-actions';
import type { PlannerTask } from '@/lib/recurrence/expand';

/** What the user is about to do to a recurring task. */
export type ScopeAction = 'edit' | 'delete' | 'repeat' | 'stop-repeating';

function copyFor(action: ScopeAction): { title: string; description: string } {
    switch (action) {
        case 'edit':
            return {
                title: t('task.scopeEditTitle'),
                description: t('task.scopeEditDescription'),
            };
        case 'delete':
            return {
                title: t('task.scopeDeleteTitle'),
                description: t('task.scopeDeleteDescription'),
            };
        case 'repeat':
            return {
                title: t('task.scopeRepeatTitle'),
                description: t('task.scopeRepeatDescription'),
            };
        case 'stop-repeating':
            return {
                title: t('task.scopeStopTitle'),
                description: t('task.scopeStopDescription'),
            };
    }
}

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
 * Focus back where the prompt was asked from; when that is gone (a color
 * swatch in a popover that has closed), the dialog still open under it (the
 * task dialog), so its keys keep working. Returns whether it focused one.
 */
function restoreFocus(target: HTMLElement | null): boolean {
    const fallback = [
        ...document.querySelectorAll<HTMLElement>(
            '[role="dialog"][data-state="open"]',
        ),
    ].at(-1);
    const element = target?.isConnected ? target : fallback;
    element?.focus();

    return element !== undefined;
}

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
        restoreFocus(returnFocus.current);
    };

    const copy = prompt ? copyFor(prompt.action) : null;
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
                            if (restoreFocus(returnFocus.current)) {
                                event.preventDefault();
                            }
                        }}
                    >
                        <AlertDialogHeader>
                            <AlertDialogTitle>{copy.title}</AlertDialogTitle>
                            <AlertDialogDescription>
                                {copy.description}
                                {prompt?.remembered &&
                                    ` ${t('task.scopeRemembered')}`}
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>
                                {t('common.cancel')}
                            </AlertDialogCancel>
                            {/*
                              Two answers: Radix's Action closes the prompt,
                              so each one resolves before it closes.
                            */}
                            <AlertDialogAction
                                variant="outline"
                                onClick={() => answer('future')}
                            >
                                {t('task.scopeFuture')}
                            </AlertDialogAction>
                            <AlertDialogAction
                                variant={
                                    destructive ? 'destructive' : 'default'
                                }
                                onClick={() => answer('this')}
                            >
                                {t('task.scopeThis')}
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
