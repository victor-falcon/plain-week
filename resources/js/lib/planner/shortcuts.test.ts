import { describe, expect, it } from 'vite-plus/test';
import {
    SEQUENCE_TIMEOUT_MS,
    PLANNER_SHORTCUTS,
    SHORTCUTS,
    TASK_DIALOG_SHORTCUTS,
    createShortcutMatcher,
    effectiveAction,
    keyToken,
    keysFor,
    shortcutById,
} from './shortcuts';
import type { MatchResult } from './shortcuts';

function matchedId(result: MatchResult): string | null {
    return result.type === 'match' ? result.shortcut.id : null;
}

describe('SHORTCUTS', () => {
    it('has unique ids', () => {
        const ids = SHORTCUTS.map((shortcut) => shortcut.id);

        expect(new Set(ids).size).toBe(ids.length);
    });

    it('splits into the planner keys and the task dialog keys', () => {
        expect(PLANNER_SHORTCUTS.length + TASK_DIALOG_SHORTCUTS.length).toBe(
            SHORTCUTS.length,
        );
        expect(
            TASK_DIALOG_SHORTCUTS.every(
                (shortcut) => shortcut.group === 'Task dialog',
            ),
        ).toBe(true);
    });

    describe.each([
        ['planner', PLANNER_SHORTCUTS],
        ['task dialog', TASK_DIALOG_SHORTCUTS],
    ])('in the %s', (_, shortcuts) => {
        it('binds each key sequence to one action only', () => {
            const sequences = shortcuts.flatMap((shortcut) =>
                shortcut.keys.map((keys) => keys.join(' ')),
            );

            expect(new Set(sequences).size).toBe(sequences.length);
        });

        it('never binds a single key that also starts a sequence', () => {
            const singles = new Set(
                shortcuts.flatMap((shortcut) =>
                    shortcut.keys.filter((keys) => keys.length === 1).flat(),
                ),
            );
            const starts = shortcuts.flatMap((shortcut) =>
                shortcut.keys
                    .filter((keys) => keys.length > 1)
                    .map(([first]) => first),
            );

            expect(starts.filter((key) => singles.has(key))).toEqual([]);
        });
    });

    it('mirrors in pairs', () => {
        for (const shortcut of SHORTCUTS) {
            if (shortcut.mirror) {
                expect(shortcutById(shortcut.mirror).mirror).toBe(shortcut.id);
            }
        }
    });
});

describe('keyToken', () => {
    it('keeps printable keys, case included', () => {
        expect(keyToken({ key: 'g', shiftKey: false })).toBe('g');
        expect(keyToken({ key: 'G', shiftKey: true })).toBe('G');
        expect(keyToken({ key: '?', shiftKey: true })).toBe('?');
    });

    it('names Space and Shift with a named key', () => {
        expect(keyToken({ key: ' ', shiftKey: false })).toBe('Space');
        expect(keyToken({ key: 'F10', shiftKey: true })).toBe('Shift+F10');
        expect(keyToken({ key: 'ArrowDown', shiftKey: false })).toBe(
            'ArrowDown',
        );
    });
});

describe('createShortcutMatcher', () => {
    it('matches single keys and their alternatives', () => {
        const matcher = createShortcutMatcher();

        expect(matchedId(matcher.press('j', 0))).toBe('cursor.down');
        expect(matchedId(matcher.press('ArrowDown', 10))).toBe('cursor.down');
        expect(matchedId(matcher.press('G', 20))).toBe('cursor.last');
        expect(matchedId(matcher.press('Space', 30))).toBe('task.toggleDone');
    });

    it('waits for the second key of a sequence', () => {
        const matcher = createShortcutMatcher();

        expect(matcher.press('g', 0)).toEqual({ type: 'pending' });
        expect(matchedId(matcher.press('g', 100))).toBe('cursor.first');
        expect(matcher.press('d', 200)).toEqual({ type: 'pending' });
        expect(matchedId(matcher.press('d', 300))).toBe('task.delete');
    });

    it('starts over when the sequence times out', () => {
        const matcher = createShortcutMatcher();

        matcher.press('d', 0);

        expect(matcher.press('d', SEQUENCE_TIMEOUT_MS + 1)).toEqual({
            type: 'pending',
        });
        expect(matchedId(matcher.press('d', SEQUENCE_TIMEOUT_MS + 2))).toBe(
            'task.delete',
        );
    });

    it('runs a key that breaks a sequence on its own', () => {
        const matcher = createShortcutMatcher();

        matcher.press('g', 0);

        expect(matchedId(matcher.press('j', 10))).toBe('cursor.down');
        // "g" then "d" leaves "d" waiting for its own sequence.
        matcher.press('g', 20);
        expect(matcher.press('d', 30)).toEqual({ type: 'pending' });
        expect(matchedId(matcher.press('d', 40))).toBe('task.delete');
    });

    it('ignores unknown keys and forgets a pending sequence', () => {
        const matcher = createShortcutMatcher();

        expect(matcher.press('q', 0)).toEqual({ type: 'none' });
        matcher.press('g', 10);
        expect(matcher.press('q', 20)).toEqual({ type: 'none' });
        expect(matcher.press('g', 30)).toEqual({ type: 'pending' });
    });

    it('forgets a pending sequence on reset', () => {
        const matcher = createShortcutMatcher();

        matcher.press('g', 0);
        matcher.reset();

        expect(matcher.press('g', 10)).toEqual({ type: 'pending' });
    });
});

describe('RTL mirroring', () => {
    it('swaps the days and weeks that keys point to', () => {
        const h = shortcutById('cursor.previousDay');
        const left = shortcutById('week.previous');

        expect(effectiveAction(h, false)).toBe('cursor.previousDay');
        expect(effectiveAction(h, true)).toBe('cursor.nextDay');
        expect(effectiveAction(left, true)).toBe('week.next');
    });

    it('keeps the rest', () => {
        expect(effectiveAction(shortcutById('cursor.down'), true)).toBe(
            'cursor.down',
        );
        expect(effectiveAction(shortcutById('task.nextDay'), true)).toBe(
            'task.nextDay',
        );
    });

    it('lists the keys that run an action in the current direction', () => {
        expect(keysFor('cursor.nextDay')).toEqual([['l']]);
        expect(keysFor('cursor.nextDay', true)).toEqual([['h']]);
        expect(keysFor('week.next', true)).toEqual([['H'], ['ArrowLeft']]);
        expect(keysFor('task.delete', true)).toEqual([
            ['d', 'd'],
            ['Delete'],
            ['Backspace'],
        ]);
    });
});
