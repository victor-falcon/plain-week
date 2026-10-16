import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { CURSOR_STOP_SELECTOR } from '@/lib/planner/cursor';
import {
    createShortcutMatcher,
    effectiveAction,
    keyToken,
    singleKeyShortcut,
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

/** Whether a key press goes to a text field (typing, not a shortcut). */
export function isEditable(target: EventTarget | null): boolean {
    return (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
            target.closest('input, textarea, select, [contenteditable]') !==
                null)
    );
}

/**
 * Where Enter and Space act on the cursor: nowhere in particular (the page)
 * or a cursor stop. Elsewhere (a header button, a task's check button) they
 * keep their own meaning.
 */
function isCursorTarget(target: EventTarget | null): boolean {
    return (
        target === null ||
        target === document.body ||
        target === document.documentElement ||
        (target instanceof Element &&
            target.closest(CURSOR_STOP_SELECTOR) !== null)
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
    const [matcher] = useState(createShortcutMatcher);
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
            matcher.reset();

            return;
        }

        const token = keyToken(event);

        if (
            (token === 'Enter' || token === 'Space') &&
            !isCursorTarget(event.target)
        ) {
            matcher.reset();

            return;
        }

        // A held key never continues a sequence (holding "g" is not "g g").
        let shortcut = singleKeyShortcut(token);

        if (!event.repeat) {
            const result = matcher.press(token, Date.now());
            shortcut = result.type === 'match' ? result.shortcut : undefined;
        }

        const rtl = document.documentElement.dir === 'rtl';
        const handler = shortcut && handlers[effectiveAction(shortcut, rtl)];

        if (!shortcut || !handler) {
            return;
        }

        if (event.repeat && !shortcut.repeats) {
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
