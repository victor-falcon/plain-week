import { useState } from 'react';
import type { KeyboardEvent } from 'react';
import { isEditable, isPlainKeyPress } from '@/lib/planner/key-events';
import {
    TASK_DIALOG_SHORTCUTS,
    createShortcutMatcher,
    keyToken,
} from '@/lib/planner/shortcuts';
import type { ShortcutId } from '@/lib/planner/shortcuts';

type DialogShortcutId = Extract<ShortcutId, `dialog.${string}`>;

/**
 * What each dialog key does. A handler that returns `false` had nothing to
 * act on (a series row cannot move): the key keeps its default.
 */
export type TaskDialogShortcutHandlers = Partial<
    Record<DialogShortcutId, () => boolean | void>
>;

/**
 * The task dialog's keys (the "Task dialog" group of
 * `lib/planner/shortcuts.ts`). They are plain keys, so they only run when
 * focus is in the dialog but not in one of its text fields, and not in one of
 * its open popovers or menus (portaled, so outside the dialog's element),
 * nor in a part that keeps its own keys (`data-own-keys`: the subtasks).
 * Enter and Space stay with the focused button.
 *
 * Returns the dialog content's `onKeyDown`.
 */
export function useTaskDialogShortcuts(
    handlers: TaskDialogShortcutHandlers,
): (event: KeyboardEvent<HTMLElement>) => void {
    const [matcher] = useState(() =>
        createShortcutMatcher(TASK_DIALOG_SHORTCUTS),
    );

    return (event) => {
        if (
            event.defaultPrevented ||
            !isPlainKeyPress(event.nativeEvent) ||
            event.repeat ||
            isEditable(event.target) ||
            !(event.target instanceof Element) ||
            !event.currentTarget.contains(event.target) ||
            event.target.closest('[data-own-keys]') !== null
        ) {
            matcher.reset();

            return;
        }

        const token = keyToken(event);

        if (token === 'Enter' || token === 'Space') {
            return;
        }

        const result = matcher.press(token, Date.now());
        const handler =
            result.type === 'match'
                ? handlers[result.shortcut.id as DialogShortcutId]
                : undefined;

        if (handler && handler() !== false) {
            event.preventDefault();
        }
    };
}
