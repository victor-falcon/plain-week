import { useState } from 'react';
import type { KeyboardEvent } from 'react';
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
 * Returns the menu content's `onKeyDown`.
 */
export function useMenuShortcuts(
    actions: ShortcutId[],
): (event: KeyboardEvent<HTMLElement>) => void {
    const [matcher] = useState(() =>
        createShortcutMatcher(actions.map(shortcutById)),
    );

    return (event) => {
        if (
            event.nativeEvent.isComposing ||
            event.altKey ||
            event.ctrlKey ||
            event.metaKey
        ) {
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
