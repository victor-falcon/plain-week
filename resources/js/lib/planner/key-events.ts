/**
 * Guards shared by the key handlers (planner, task dialog, menus): what is
 * typing and what is a shortcut press.
 */

type KeyPress = Pick<
    KeyboardEvent,
    'altKey' | 'ctrlKey' | 'metaKey' | 'isComposing'
>;

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
 * Whether a press can be a shortcut: no Ctrl, Meta or Alt (those belong to
 * the browser and the system) and not part of an IME composition.
 */
export function isPlainKeyPress(event: KeyPress): boolean {
    return !(
        event.isComposing ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey
    );
}
