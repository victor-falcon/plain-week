/**
 * The planner's keyboard shortcuts, as data: the single source of truth for
 * the key handler (`hooks/use-planner-shortcuts.ts`) and the shortcuts dialog
 * (`?`). Keys are case-sensitive `KeyboardEvent.key` values ("G" is Shift+G),
 * with "Space" for the space bar and "Shift+F10" for Shift plus a named key.
 * A binding of several keys is a sequence ("g g"), typed within
 * `SEQUENCE_TIMEOUT_MS`.
 */

export const SHORTCUT_GROUPS = [
    'Navigation',
    'Tasks',
    'Weeks',
    'General',
] as const;

export type ShortcutGroup = (typeof SHORTCUT_GROUPS)[number];

export type ShortcutId =
    | 'cursor.previousDay'
    | 'cursor.nextDay'
    | 'cursor.down'
    | 'cursor.up'
    | 'cursor.first'
    | 'cursor.last'
    | 'cursor.clear'
    | 'task.open'
    | 'task.toggleDone'
    | 'task.moveDown'
    | 'task.moveUp'
    | 'task.nextDay'
    | 'task.previousDay'
    | 'task.nextWeek'
    | 'task.someday'
    | 'task.duplicate'
    | 'task.delete'
    | 'task.menu'
    | 'task.new'
    | 'week.previous'
    | 'week.next'
    | 'week.today'
    | 'general.undo'
    | 'general.settings'
    | 'general.help';

/** A key sequence; most are a single key. */
export type KeySequence = string[];

export type ShortcutDefinition = {
    id: ShortcutId;
    /** Every binding that runs it, the first one being the main one. */
    keys: KeySequence[];
    label: string;
    group: ShortcutGroup;
    /**
     * In right-to-left layouts these keys run this other action: "h" and "←"
     * point left, which is the next day there.
     */
    mirror?: ShortcutId;
    /** Holding the key repeats it (cursor motions). Off for everything else. */
    repeats?: boolean;
};

export const SHORTCUTS: ShortcutDefinition[] = [
    {
        id: 'cursor.previousDay',
        keys: [['h']],
        label: 'Previous day',
        group: 'Navigation',
        mirror: 'cursor.nextDay',
        repeats: true,
    },
    {
        id: 'cursor.nextDay',
        keys: [['l']],
        label: 'Next day',
        group: 'Navigation',
        mirror: 'cursor.previousDay',
        repeats: true,
    },
    {
        id: 'cursor.down',
        keys: [['j'], ['ArrowDown']],
        label: 'Next task',
        group: 'Navigation',
        repeats: true,
    },
    {
        id: 'cursor.up',
        keys: [['k'], ['ArrowUp']],
        label: 'Previous task',
        group: 'Navigation',
        repeats: true,
    },
    {
        id: 'cursor.first',
        keys: [['g', 'g']],
        label: 'First task of the day',
        group: 'Navigation',
    },
    {
        id: 'cursor.last',
        keys: [['G']],
        label: 'Last task of the day',
        group: 'Navigation',
    },
    {
        id: 'cursor.clear',
        keys: [['Escape']],
        label: 'Hide the cursor',
        group: 'Navigation',
    },
    {
        id: 'task.open',
        keys: [['o'], ['Enter']],
        label: 'Open',
        group: 'Tasks',
    },
    {
        id: 'task.toggleDone',
        keys: [['x'], ['Space']],
        label: 'Mark as done or not done',
        group: 'Tasks',
    },
    {
        id: 'task.new',
        keys: [['a'], ['i']],
        label: 'New task in this day',
        group: 'Tasks',
    },
    {
        id: 'task.moveDown',
        keys: [['J']],
        label: 'Move down',
        group: 'Tasks',
    },
    {
        id: 'task.moveUp',
        keys: [['K']],
        label: 'Move up',
        group: 'Tasks',
    },
    {
        id: 'task.nextDay',
        keys: [['>']],
        label: 'Move to the next day',
        group: 'Tasks',
    },
    {
        id: 'task.previousDay',
        keys: [['<']],
        label: 'Move to the previous day',
        group: 'Tasks',
    },
    {
        id: 'task.nextWeek',
        keys: [['w']],
        label: 'Move to next week',
        group: 'Tasks',
    },
    {
        id: 'task.someday',
        keys: [['s']],
        label: 'Move to Someday',
        group: 'Tasks',
    },
    {
        id: 'task.duplicate',
        keys: [['y']],
        label: 'Duplicate',
        group: 'Tasks',
    },
    {
        id: 'task.delete',
        keys: [['d', 'd'], ['Delete'], ['Backspace']],
        label: 'Delete',
        group: 'Tasks',
    },
    {
        id: 'task.menu',
        keys: [['m'], ['Shift+F10'], ['ContextMenu']],
        label: 'Task menu (color, more)',
        group: 'Tasks',
    },
    {
        id: 'week.previous',
        keys: [['H'], ['ArrowLeft']],
        label: 'Previous week',
        group: 'Weeks',
        mirror: 'week.next',
    },
    {
        id: 'week.next',
        keys: [['L'], ['ArrowRight']],
        label: 'Next week',
        group: 'Weeks',
        mirror: 'week.previous',
    },
    {
        id: 'week.today',
        keys: [['t']],
        label: 'This week, on today',
        group: 'Weeks',
    },
    {
        id: 'general.undo',
        keys: [['u']],
        label: 'Undo what the latest toast offers',
        group: 'General',
    },
    {
        id: 'general.settings',
        keys: [[',']],
        label: 'Settings',
        group: 'General',
    },
    {
        id: 'general.help',
        keys: [['?']],
        label: 'Keyboard shortcuts',
        group: 'General',
    },
];

const BY_ID = new Map(SHORTCUTS.map((shortcut) => [shortcut.id, shortcut]));

export function shortcutById(id: ShortcutId): ShortcutDefinition {
    return BY_ID.get(id)!;
}

/**
 * The action a binding of `shortcut` runs: itself, or its mirror in a
 * right-to-left layout.
 */
export function effectiveAction(
    shortcut: ShortcutDefinition,
    rtl: boolean,
): ShortcutId {
    return rtl && shortcut.mirror ? shortcut.mirror : shortcut.id;
}

/**
 * The bindings that run `id` in the current direction (in RTL, "h" runs
 * "Next day"). What the dialog, and key hints, show for an action.
 */
export function keysFor(id: ShortcutId, rtl = false): KeySequence[] {
    const shortcut = shortcutById(id);
    const source =
        rtl && shortcut.mirror ? shortcutById(shortcut.mirror) : shortcut;

    return source.keys;
}

/** How a key is printed in the dialog ("←", "Space", "Shift F10"). */
export function keyLabel(key: string): string {
    switch (key) {
        case 'ArrowLeft':
            return '←';
        case 'ArrowRight':
            return '→';
        case 'ArrowUp':
            return '↑';
        case 'ArrowDown':
            return '↓';
        case 'Escape':
            return 'Esc';
        case 'Backspace':
            return '⌫';
        case 'ContextMenu':
            return 'Menu';
        default:
            return key.replace('+', ' ');
    }
}

/** Accessible name of a key ("Left arrow", "Shift G"), for screen readers. */
export function keyName(key: string): string {
    switch (key) {
        case 'ArrowLeft':
            return 'Left arrow';
        case 'ArrowRight':
            return 'Right arrow';
        case 'ArrowUp':
            return 'Up arrow';
        case 'ArrowDown':
            return 'Down arrow';
        case 'ContextMenu':
            return 'Context menu key';
        default:
            return /^[A-Z]$/.test(key) ? `Shift ${key}` : key.replace('+', ' ');
    }
}

/** The one-key binding of `token`, if any (for held keys, which never
 * continue a sequence). */
export function singleKeyShortcut(
    token: string,
    shortcuts: ShortcutDefinition[] = SHORTCUTS,
): ShortcutDefinition | undefined {
    return shortcuts.find((shortcut) =>
        shortcut.keys.some((keys) => keys.length === 1 && keys[0] === token),
    );
}

/**
 * The token a key press stands for in `SHORTCUTS`: its `key` (which already
 * carries Shift for printable keys: "G", "?"), "Space", or "Shift+<name>" for
 * Shift plus a named key ("Shift+F10").
 */
export function keyToken(event: Pick<KeyboardEvent, 'key' | 'shiftKey'>) {
    if (event.key === ' ') {
        return 'Space';
    }

    return event.shiftKey && event.key.length > 1
        ? `Shift+${event.key}`
        : event.key;
}

/** Keys of a sequence wait this long for the next one. */
export const SEQUENCE_TIMEOUT_MS = 1000;

export type MatchResult =
    | { type: 'match'; shortcut: ShortcutDefinition }
    /** The key starts a sequence ("g" of "g g"): wait for the next one. */
    | { type: 'pending' }
    | { type: 'none' };

export type ShortcutMatcher = {
    press: (token: string, now: number) => MatchResult;
    reset: () => void;
};

function startsWith(sequence: KeySequence, prefix: string[]): boolean {
    return prefix.every((key, index) => sequence[index] === key);
}

/**
 * Turns key presses into shortcuts, with vim-like sequences: a key that
 * starts a sequence waits up to `timeout` ms for the next one; a key that
 * does not continue it is tried again on its own ("g" then "j" is "j").
 */
export function createShortcutMatcher(
    shortcuts: ShortcutDefinition[] = SHORTCUTS,
    timeout = SEQUENCE_TIMEOUT_MS,
): ShortcutMatcher {
    let buffer: string[] = [];
    let lastPress = 0;

    const match = (keys: string[]): MatchResult => {
        let pending = false;

        for (const shortcut of shortcuts) {
            for (const sequence of shortcut.keys) {
                if (!startsWith(sequence, keys)) {
                    continue;
                }

                if (sequence.length === keys.length) {
                    return { type: 'match', shortcut };
                }

                pending = true;
            }
        }

        return pending ? { type: 'pending' } : { type: 'none' };
    };

    return {
        press(token, now) {
            if (now - lastPress > timeout) {
                buffer = [];
            }

            lastPress = now;

            const attempts =
                buffer.length > 0 ? [[...buffer, token], [token]] : [[token]];

            for (const keys of attempts) {
                const result = match(keys);

                if (result.type === 'pending') {
                    buffer = keys;

                    return result;
                }

                if (result.type === 'match') {
                    buffer = [];

                    return result;
                }
            }

            buffer = [];

            return { type: 'none' };
        },
        reset() {
            buffer = [];
        },
    };
}
