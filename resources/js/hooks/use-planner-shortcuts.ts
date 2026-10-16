import { useEffect, useEffectEvent, useRef } from 'react';
import {
    createShortcutMatcher,
    effectiveAction,
    keyToken,
} from '@/lib/planner/shortcuts';
import type { ShortcutId } from '@/lib/planner/shortcuts';

/**
 * What each shortcut does. A handler that returns `false` had nothing to act
 * on: the key keeps its default (Space still scrolls the page).
 */
export type ShortcutHandlers = Partial<
    Record<ShortcutId, () => boolean | void>
>;

/**
 * Open dialogs, alert dialogs and menus, and a task being dragged (its drag
 * overlay), suspend the planner shortcuts.
 */
export const OVERLAY_SELECTOR =
    '[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"], [data-drag-overlay]';

/**
 * Where Enter and Space act on the cursor: nowhere in particular (the page),
 * a task's text button or a new-task row stop. Elsewhere (a header button, a
 * task's check button) they keep their own meaning.
 */
const CURSOR_TARGET_SELECTOR = '[data-task-open], [data-new-task-row]';

function isEditable(target: EventTarget | null): boolean {
    return (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
            target.closest('input, textarea, select, [contenteditable]') !==
                null)
    );
}

function isCursorTarget(target: EventTarget | null): boolean {
    return (
        target === null ||
        target === document.body ||
        target === document.documentElement ||
        (target instanceof Element &&
            target.closest(CURSOR_TARGET_SELECTOR) !== null)
    );
}

/**
 * The planner's keyboard shortcuts (`lib/planner/shortcuts.ts`): one window
 * listener that turns key presses, and vim-like sequences ("g g"), into the
 * handlers' actions, mirrored in RTL where a key points left or right. They
 * only run when focus is not in a text field, no dialog or menu is open and
 * no task is being dragged. Held keys repeat only cursor motions.
 */
export function usePlannerShortcuts(handlers: ShortcutHandlers): void {
    const matcher = useRef(createShortcutMatcher());
    // Space activates a focused button on key up: the press it was handled
    // as must not also click it.
    const swallowSpaceUp = useRef(false);

    const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
        if (
            event.defaultPrevented ||
            event.isComposing ||
            event.altKey ||
            event.ctrlKey ||
            event.metaKey ||
            isEditable(event.target) ||
            document.querySelector(OVERLAY_SELECTOR) !== null
        ) {
            matcher.current.reset();

            return;
        }

        const token = keyToken(event);

        if (
            (token === 'Enter' || token === 'Space') &&
            !isCursorTarget(event.target)
        ) {
            matcher.current.reset();

            return;
        }

        const result = matcher.current.press(token, Date.now());

        if (result.type !== 'match') {
            return;
        }

        const rtl = document.documentElement.dir === 'rtl';
        const handler = handlers[effectiveAction(result.shortcut, rtl)];

        if (!handler) {
            return;
        }

        if (event.repeat && !result.shortcut.repeats) {
            // Holding a key repeats it: one week per press is enough.
            event.preventDefault();

            return;
        }

        if (handler() !== false) {
            event.preventDefault();
            swallowSpaceUp.current = token === 'Space';
        }
    });

    const onKeyUp = useEffectEvent((event: KeyboardEvent) => {
        if (event.key === ' ' && swallowSpaceUp.current) {
            swallowSpaceUp.current = false;
            event.preventDefault();
        }
    });

    useEffect(() => {
        window.addEventListener('keydown', onKeyDown);
        window.addEventListener('keyup', onKeyUp);

        return () => {
            window.removeEventListener('keydown', onKeyDown);
            window.removeEventListener('keyup', onKeyUp);
        };
    }, []);
}
