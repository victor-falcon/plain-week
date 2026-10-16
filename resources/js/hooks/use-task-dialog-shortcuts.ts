import { useState } from 'react';
import type { KeyboardEvent } from 'react';
import { isEditable } from '@/hooks/use-planner-shortcuts';
import type { ShortcutHandlers } from '@/hooks/use-planner-shortcuts';
import {
    TASK_DIALOG_SHORTCUTS,
    createShortcutMatcher,
    keyToken,
} from '@/lib/planner/shortcuts';

/**
 * The task dialog's keys (the "Task dialog" group of
 * `lib/planner/shortcuts.ts`). They are plain keys, so they only run when
 * focus is in the dialog but not in one of its text fields, and not in one of
 * its open popovers or menus (portaled, so outside the dialog's element).
 * Enter and Space stay with the focused button.
 *
 * Returns the dialog content's `onKeyDown`.
 */
export function useTaskDialogShortcuts(
    handlers: ShortcutHandlers,
): (event: KeyboardEvent<HTMLElement>) => void {
    const [matcher] = useState(() =>
        createShortcutMatcher(TASK_DIALOG_SHORTCUTS),
    );

    return (event) => {
        if (
            event.defaultPrevented ||
            event.nativeEvent.isComposing ||
            event.altKey ||
            event.ctrlKey ||
            event.metaKey ||
            event.repeat ||
            isEditable(event.target) ||
            !(event.target instanceof Node) ||
            !event.currentTarget.contains(event.target)
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
            result.type === 'match' ? handlers[result.shortcut.id] : undefined;

        if (handler && handler() !== false) {
            event.preventDefault();
        }
    };
}
