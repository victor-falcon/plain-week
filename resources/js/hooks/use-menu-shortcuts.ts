import { useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { isPlainKeyPress } from '@/lib/planner/key-events';
import {
    createShortcutMatcher,
    keyToken,
    shortcutById,
} from '@/lib/planner/shortcuts';
import type { ShortcutId } from '@/lib/planner/shortcuts';

/**
 * Keys inside an open menu: the items show their shortcut
 * (`ShortcutHint`), and pressing it picks the item, as a click would. Items
 * opt in with `data-shortcut="<id>"`. A key of one of `actions` (or the first
 * key of a sequence, like "d" of "d d") never reaches the menu's typeahead.
 *
 * Items are picked by a click on the element, not a callback: that is what
 * closes an uncontrolled menu (the context menu) the way a pick does.
 *
 * Returns the menu content's `onKeyDown`. `actions` is read once.
 */
export function useMenuShortcuts(
    actions: ShortcutId[],
): (event: KeyboardEvent<HTMLElement>) => void {
    const [matcher] = useState(() =>
        createShortcutMatcher(actions.map(shortcutById)),
    );
    // Each opening mounts a new menu: a "d" pressed before it closed does
    // not carry over into a "d d".
    const menu = useRef<HTMLElement | null>(null);

    return (event) => {
        if (menu.current !== event.currentTarget) {
            menu.current = event.currentTarget;
            matcher.reset();
        }

        if (!isPlainKeyPress(event.nativeEvent) || event.repeat) {
            matcher.reset();

            return;
        }

        const result = matcher.press(keyToken(event), Date.now());

        if (result.type === 'none') {
            return;
        }

        event.preventDefault();

        if (result.type === 'match') {
            event.currentTarget
                .querySelector<HTMLElement>(
                    `[data-shortcut="${result.shortcut.id}"]:not([data-disabled])`,
                )
                ?.click();
        }
    };
}
