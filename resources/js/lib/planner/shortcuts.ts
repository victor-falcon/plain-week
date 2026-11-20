/**
 * The keyboard shortcuts, as data: the single source of truth for the key
 * handlers (`hooks/use-planner-shortcuts.ts` on the planner,
 * `hooks/use-task-dialog-shortcuts.ts` in the task dialog), the shortcuts
 * dialog (`?`) and the key hints (`ShortcutHint`). Keys are case-sensitive `KeyboardEvent.key` values ("G" is Shift+G),
 * with "Space" for the space bar and "Shift+F10" for Shift plus a named key.
 * A binding of several keys is a sequence ("g g"), typed within
 * `SEQUENCE_TIMEOUT_MS`.
 */

import { t } from '@/lib/i18n';

export const SHORTCUT_GROUPS = [
    'Navigation',
    'Tasks',
    'Weeks',
    'General',
    'Task dialog',
] as const;

export type ShortcutGroup = (typeof SHORTCUT_GROUPS)[number];

/** A group's heading in the active language. */
export function groupLabel(group: ShortcutGroup): string {
    switch (group) {
        case 'Navigation':
            return t('planner.shortcutGroupNavigation');
        case 'Tasks':
            return t('planner.shortcutGroupTasks');
        case 'Weeks':
            return t('planner.shortcutGroupWeeks');
        case 'General':
            return t('planner.shortcutGroupGeneral');
        case 'Task dialog':
            return t('planner.shortcutGroupTaskDialog');
    }
}

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
    | 'general.help'
    | 'dialog.date'
    | 'dialog.time'
    | 'dialog.repeat'
    | 'dialog.color'
    | 'dialog.more'
    | 'dialog.title'
    | 'dialog.notes'
    | 'dialog.subtask'
    | 'dialog.toggleDone'
    | 'dialog.nextDay'
    | 'dialog.nextWeek'
    | 'dialog.someday'
    | 'dialog.duplicate'
    | 'dialog.delete'
    | 'dialog.close';

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
        get label() {
            return t('planner.shortcutCursorPreviousDay');
        },
        group: 'Navigation',
        mirror: 'cursor.nextDay',
        repeats: true,
    },
    {
        id: 'cursor.nextDay',
        keys: [['l']],
        get label() {
            return t('planner.shortcutCursorNextDay');
        },
        group: 'Navigation',
        mirror: 'cursor.previousDay',
        repeats: true,
    },
    {
        id: 'cursor.down',
        keys: [['j'], ['ArrowDown']],
        get label() {
            return t('planner.shortcutCursorDown');
        },
        group: 'Navigation',
        repeats: true,
    },
    {
        id: 'cursor.up',
        keys: [['k'], ['ArrowUp']],
        get label() {
            return t('planner.shortcutCursorUp');
        },
        group: 'Navigation',
        repeats: true,
    },
    {
        id: 'cursor.first',
        keys: [['g', 'g']],
        get label() {
            return t('planner.shortcutCursorFirst');
        },
        group: 'Navigation',
    },
    {
        id: 'cursor.last',
        keys: [['G']],
        get label() {
            return t('planner.shortcutCursorLast');
        },
        group: 'Navigation',
    },
    {
        id: 'cursor.clear',
        keys: [['Escape']],
        get label() {
            return t('planner.shortcutCursorClear');
        },
        group: 'Navigation',
    },
    {
        id: 'task.open',
        // On a new-task row, Enter starts typing (the row's hint shows it).
        keys: [['Enter']],
        get label() {
            return t('planner.shortcutTaskOpen');
        },
        group: 'Tasks',
    },
    {
        id: 'task.toggleDone',
        keys: [['x'], ['Space']],
        get label() {
            return t('planner.shortcutTaskToggleDone');
        },
        group: 'Tasks',
    },
    {
        id: 'task.new',
        keys: [['a'], ['i']],
        get label() {
            return t('planner.shortcutTaskNew');
        },
        group: 'Tasks',
    },
    {
        id: 'task.moveDown',
        keys: [['J']],
        get label() {
            return t('planner.shortcutTaskMoveDown');
        },
        group: 'Tasks',
    },
    {
        id: 'task.moveUp',
        keys: [['K']],
        get label() {
            return t('planner.shortcutTaskMoveUp');
        },
        group: 'Tasks',
    },
    {
        id: 'task.nextDay',
        keys: [['>']],
        get label() {
            return t('planner.shortcutTaskNextDay');
        },
        group: 'Tasks',
    },
    {
        id: 'task.previousDay',
        keys: [['<']],
        get label() {
            return t('planner.shortcutTaskPreviousDay');
        },
        group: 'Tasks',
    },
    {
        id: 'task.nextWeek',
        keys: [['w']],
        get label() {
            return t('planner.shortcutTaskNextWeek');
        },
        group: 'Tasks',
    },
    {
        id: 'task.someday',
        keys: [['s']],
        get label() {
            return t('planner.shortcutTaskSomeday');
        },
        group: 'Tasks',
    },
    {
        id: 'task.duplicate',
        keys: [['y']],
        get label() {
            return t('planner.shortcutTaskDuplicate');
        },
        group: 'Tasks',
    },
    {
        id: 'task.delete',
        keys: [['d', 'd'], ['Delete'], ['Backspace']],
        get label() {
            return t('planner.shortcutTaskDelete');
        },
        group: 'Tasks',
    },
    {
        id: 'task.menu',
        keys: [['m'], ['Shift+F10'], ['ContextMenu']],
        get label() {
            return t('planner.shortcutTaskMenu');
        },
        group: 'Tasks',
    },
    {
        id: 'week.previous',
        keys: [['H'], ['ArrowLeft']],
        get label() {
            return t('planner.shortcutWeekPrevious');
        },
        group: 'Weeks',
        mirror: 'week.next',
    },
    {
        id: 'week.next',
        keys: [['L'], ['ArrowRight']],
        get label() {
            return t('planner.shortcutWeekNext');
        },
        group: 'Weeks',
        mirror: 'week.previous',
    },
    {
        id: 'week.today',
        keys: [['t']],
        get label() {
            return t('planner.shortcutWeekToday');
        },
        group: 'Weeks',
    },
    {
        id: 'general.undo',
        keys: [['u']],
        get label() {
            return t('planner.shortcutGeneralUndo');
        },
        group: 'General',
    },
    {
        id: 'general.settings',
        keys: [[',']],
        get label() {
            return t('planner.shortcutGeneralSettings');
        },
        group: 'General',
    },
    {
        id: 'general.help',
        keys: [['?']],
        get label() {
            return t('planner.shortcutGeneralHelp');
        },
        group: 'General',
    },
    // The task dialog's own keys: plain keys, so they only run when focus is
    // not in one of its text fields (Tab leaves a field).
    {
        id: 'dialog.date',
        keys: [['d']],
        get label() {
            return t('planner.shortcutDialogDate');
        },
        group: 'Task dialog',
    },
    {
        id: 'dialog.time',
        keys: [['t']],
        get label() {
            return t('planner.shortcutDialogTime');
        },
        group: 'Task dialog',
    },
    {
        id: 'dialog.repeat',
        keys: [['r']],
        get label() {
            return t('planner.shortcutDialogRepeat');
        },
        group: 'Task dialog',
    },
    {
        id: 'dialog.color',
        keys: [['c']],
        get label() {
            return t('planner.shortcutDialogColor');
        },
        group: 'Task dialog',
    },
    {
        id: 'dialog.more',
        keys: [['m']],
        get label() {
            return t('planner.shortcutDialogMore');
        },
        group: 'Task dialog',
    },
    {
        id: 'dialog.title',
        keys: [['e']],
        get label() {
            return t('planner.shortcutDialogTitle');
        },
        group: 'Task dialog',
    },
    {
        id: 'dialog.notes',
        keys: [['n']],
        get label() {
            return t('planner.shortcutDialogNotes');
        },
        group: 'Task dialog',
    },
    {
        id: 'dialog.subtask',
        keys: [['a']],
        get label() {
            return t('planner.shortcutDialogSubtask');
        },
        group: 'Task dialog',
    },
    {
        id: 'dialog.toggleDone',
        keys: [['x']],
        get label() {
            return t('planner.shortcutDialogToggleDone');
        },
        group: 'Task dialog',
    },
    {
        id: 'dialog.nextDay',
        keys: [['>']],
        get label() {
            return t('planner.shortcutDialogNextDay');
        },
        group: 'Task dialog',
    },
    {
        id: 'dialog.nextWeek',
        keys: [['w']],
        get label() {
            return t('planner.shortcutDialogNextWeek');
        },
        group: 'Task dialog',
    },
    {
        id: 'dialog.someday',
        keys: [['s']],
        get label() {
            return t('planner.shortcutDialogSomeday');
        },
        group: 'Task dialog',
    },
    {
        id: 'dialog.duplicate',
        keys: [['y']],
        get label() {
            return t('planner.shortcutDialogDuplicate');
        },
        group: 'Task dialog',
    },
    {
        id: 'dialog.delete',
        // Not Backspace: easy to press by reflex after typing.
        keys: [['Delete']],
        get label() {
            return t('planner.shortcutDialogDelete');
        },
        group: 'Task dialog',
    },
    // Radix closes the dialog; listed for the dialog and the hints.
    {
        id: 'dialog.close',
        keys: [['Escape']],
        get label() {
            return t('planner.shortcutDialogClose');
        },
        group: 'Task dialog',
    },
];

/** What runs on the planner itself (no dialog open). */
export const PLANNER_SHORTCUTS = SHORTCUTS.filter(
    (shortcut) => shortcut.group !== 'Task dialog',
);

/** What runs inside the task dialog. */
export const TASK_DIALOG_SHORTCUTS = SHORTCUTS.filter(
    (shortcut) => shortcut.group === 'Task dialog',
);

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

/** How a key is printed in the dialog ("←", "⏎", "Space", "Shift F10"). */
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
        case 'Enter':
            return '⏎';
        case 'Escape':
            return t('planner.keyEscape');
        case 'Backspace':
            return '⌫';
        case 'Delete':
            return t('planner.keyDelete');
        case 'ContextMenu':
            return t('planner.keyMenu');
        case 'Space':
            return t('planner.keySpace');
        default:
            return shiftedLabel(key);
    }
}

/** "Shift+F10" as "Shift F10", with "Shift" in the active language. */
function shiftedLabel(key: string): string {
    return key.startsWith('Shift+')
        ? t('planner.keyShift', { key: key.slice('Shift+'.length) })
        : key.replace('+', ' ');
}

/** Accessible name of a key ("Left arrow", "Shift G"), for screen readers. */
export function keyName(key: string): string {
    switch (key) {
        case 'ArrowLeft':
            return t('planner.keyNameArrowLeft');
        case 'ArrowRight':
            return t('planner.keyNameArrowRight');
        case 'ArrowUp':
            return t('planner.keyNameArrowUp');
        case 'ArrowDown':
            return t('planner.keyNameArrowDown');
        case 'ContextMenu':
            return t('planner.keyNameContextMenu');
        case 'Enter':
            return t('planner.keyNameEnter');
        case 'Escape':
            return t('planner.keyNameEscape');
        case 'Space':
            return t('planner.keySpace');
        default:
            return /^[A-Z]$/.test(key)
                ? t('planner.keyShift', { key })
                : shiftedLabel(key);
    }
}

/** The one-key binding of `token`, if any (for held keys, which never
 * continue a sequence). */
export function singleKeyShortcut(
    token: string,
    shortcuts: ShortcutDefinition[] = PLANNER_SHORTCUTS,
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
    shortcuts: ShortcutDefinition[] = PLANNER_SHORTCUTS,
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
