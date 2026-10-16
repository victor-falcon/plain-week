// @vitest-environment happy-dom
import { cleanup, renderHook } from '@testing-library/react';
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from 'vite-plus/test';
import { usePlannerShortcuts } from '@/hooks/use-planner-shortcuts';
import { SEQUENCE_TIMEOUT_MS } from '@/lib/planner/shortcuts';

function press(
    key: string,
    init: KeyboardEventInit = {},
    target: EventTarget = document.body,
): KeyboardEvent {
    const event = new KeyboardEvent('keydown', {
        key,
        bubbles: true,
        cancelable: true,
        ...init,
    });
    target.dispatchEvent(event);

    return event;
}

function setup() {
    const handlers = {
        'cursor.down': vi.fn(),
        'cursor.previousDay': vi.fn(),
        'cursor.nextDay': vi.fn(),
        'cursor.first': vi.fn(),
        'task.delete': vi.fn(),
        'task.toggleDone': vi.fn(() => false as const),
        'week.previous': vi.fn(),
        'week.next': vi.fn(),
        'general.help': vi.fn(),
    };
    renderHook(() => usePlannerShortcuts(handlers));

    return handlers;
}

beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
});

afterEach(() => {
    cleanup();
    vi.useRealTimers();
    document.body.innerHTML = '';
    document.documentElement.dir = '';
});

describe('usePlannerShortcuts', () => {
    it('runs the action of a key and claims the key', () => {
        const handlers = setup();

        const event = press('j');

        expect(handlers['cursor.down']).toHaveBeenCalledOnce();
        expect(event.defaultPrevented).toBe(true);
    });

    it('runs key sequences typed within the timeout', () => {
        const handlers = setup();

        press('g');
        press('g');
        press('d');
        vi.advanceTimersByTime(SEQUENCE_TIMEOUT_MS + 1);
        press('d');

        expect(handlers['cursor.first']).toHaveBeenCalledOnce();
        expect(handlers['task.delete']).not.toHaveBeenCalled();

        press('d');

        expect(handlers['task.delete']).toHaveBeenCalledOnce();
    });

    it('matches Shift keys by their character', () => {
        const handlers = setup();

        press('?', { shiftKey: true });

        expect(handlers['general.help']).toHaveBeenCalledOnce();
    });

    it('mirrors left and right in RTL', () => {
        const handlers = setup();
        document.documentElement.dir = 'rtl';

        press('h');
        press('ArrowLeft');

        expect(handlers['cursor.nextDay']).toHaveBeenCalledOnce();
        expect(handlers['week.next']).toHaveBeenCalledOnce();
        expect(handlers['cursor.previousDay']).not.toHaveBeenCalled();
    });

    it('does nothing while typing in a field', () => {
        const handlers = setup();
        const input = document.createElement('input');
        document.body.append(input);

        press('j', {}, input);

        expect(handlers['cursor.down']).not.toHaveBeenCalled();
    });

    it.each([
        ['a dialog', '<div role="dialog"></div>'],
        ['a menu', '<div role="menu"></div>'],
        ['a drag', '<div data-drag-overlay></div>'],
    ])('does nothing while %s is open', (_, html) => {
        const handlers = setup();
        document.body.innerHTML = html;

        press('j');

        expect(handlers['cursor.down']).not.toHaveBeenCalled();
    });

    it('leaves Ctrl, Meta and Alt combinations alone', () => {
        const handlers = setup();

        press('j', { ctrlKey: true });
        press('j', { metaKey: true });
        press('j', { altKey: true });

        expect(handlers['cursor.down']).not.toHaveBeenCalled();
    });

    it('repeats held cursor motions only', () => {
        const handlers = setup();

        press('j', { repeat: true });
        const held = press('ArrowRight', { repeat: true });

        expect(handlers['cursor.down']).toHaveBeenCalledOnce();
        expect(handlers['week.next']).not.toHaveBeenCalled();
        expect(held.defaultPrevented).toBe(true);
    });

    it('keeps Enter and Space for other focused buttons', () => {
        const handlers = setup();
        const button = document.createElement('button');
        document.body.append(button);

        press(' ', {}, button);

        expect(handlers['task.toggleDone']).not.toHaveBeenCalled();
    });

    it('keeps the default when the action had nothing to act on', () => {
        const handlers = setup();

        const event = press(' ');

        expect(handlers['task.toggleDone']).toHaveBeenCalledOnce();
        expect(event.defaultPrevented).toBe(false);
    });
});
