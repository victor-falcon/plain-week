// @vitest-environment happy-dom
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { KEY_HINTS_MEDIA_QUERY } from '@/hooks/use-key-hints';
import { ShortcutHint } from './shortcut-hint';

/** A device whose pointer can (or cannot) hover finely, switchable. */
function stubPointer(fine: boolean) {
    const listeners = new Set<() => void>();
    const mql = {
        matches: fine,
        media: KEY_HINTS_MEDIA_QUERY,
        addEventListener: (_: string, listener: () => void) =>
            listeners.add(listener),
        removeEventListener: (_: string, listener: () => void) =>
            listeners.delete(listener),
    };
    const matchMedia = vi.fn((query: string) => {
        expect(query).toBe(KEY_HINTS_MEDIA_QUERY);

        return mql;
    });

    vi.stubGlobal('matchMedia', matchMedia);

    return {
        set(value: boolean) {
            mql.matches = value;
            listeners.forEach((listener) => listener());
        },
    };
}

afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    document.documentElement.dir = '';
});

describe('ShortcutHint', () => {
    it('shows the main key of an action with a mouse or trackpad', () => {
        stubPointer(true);
        const { container } = render(<ShortcutHint action="task.open" />);
        const hint = container.querySelector('[data-shortcut-hint]');

        expect(hint?.textContent).toBe('⏎');
        expect(hint?.getAttribute('aria-hidden')).toBe('true');
    });

    it('shows every binding when asked, as the registry has them', () => {
        stubPointer(true);
        const { container } = render(
            <ShortcutHint action="week.previous" all />,
        );

        expect(
            [...container.querySelectorAll('kbd')].map(
                (kbd) => kbd.textContent,
            ),
        ).toEqual(['H', '←']);
    });

    it('shows the keys that run the action in RTL', () => {
        stubPointer(true);
        document.documentElement.dir = 'rtl';
        const { container } = render(<ShortcutHint action="week.previous" />);

        expect(container.textContent).toBe('L');
    });

    it('renders nothing on touch devices', () => {
        stubPointer(false);
        const { container } = render(<ShortcutHint action="task.open" />);

        expect(container.innerHTML).toBe('');
    });

    it('follows the device when its pointer changes', () => {
        const pointer = stubPointer(false);
        const { container } = render(<ShortcutHint action="task.delete" />);

        expect(container.textContent).toBe('');
        act(() => pointer.set(true));
        expect(container.textContent).toBe('dd');
        act(() => pointer.set(false));
        expect(container.textContent).toBe('');
    });
});
