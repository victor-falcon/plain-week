// @vitest-environment happy-dom
import { cleanup, render } from '@testing-library/react';
import { useRef } from 'react';
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from 'vite-plus/test';
import { useScrollToToday } from '@/hooks/use-scroll-to-today';

let stacked = true;
let reducedMotion = false;
const scrollIntoView = vi.fn();
const scrollTo = vi.fn();

function Days({
    weekKey,
    showsToday,
    ready,
}: {
    weekKey: string;
    showsToday: boolean;
    ready: boolean;
}) {
    const container = useRef<HTMLDivElement>(null);
    useScrollToToday(container, { weekStartKey: weekKey, showsToday, ready });

    return (
        <div ref={container}>
            <section />
            {showsToday && <section aria-current="date" />}
        </div>
    );
}

describe('useScrollToToday', () => {
    beforeEach(() => {
        stacked = true;
        reducedMotion = false;
        scrollIntoView.mockClear();
        scrollTo.mockClear();
        HTMLElement.prototype.scrollIntoView = scrollIntoView;
        window.scrollTo = scrollTo as typeof window.scrollTo;
        vi.spyOn(window, 'matchMedia').mockImplementation(
            (query: string) =>
                ({
                    matches: query.includes('reduced-motion')
                        ? reducedMotion
                        : stacked,
                }) as MediaQueryList,
        );
    });

    afterEach(() => {
        cleanup();
        vi.restoreAllMocks();
    });

    it('waits for the tasks, then jumps to today on load', () => {
        const { rerender } = render(
            <Days weekKey="2026-11-16" showsToday ready={false} />,
        );

        expect(scrollIntoView).not.toHaveBeenCalled();

        rerender(<Days weekKey="2026-11-16" showsToday ready />);
        rerender(<Days weekKey="2026-11-16" showsToday ready />);

        expect(scrollIntoView).toHaveBeenCalledOnce();
        expect(scrollIntoView).toHaveBeenCalledWith({
            block: 'start',
            behavior: 'instant',
        });
    });

    it('scrolls smoothly when coming back to the current week', () => {
        const { rerender } = render(
            <Days weekKey="2026-11-09" showsToday={false} ready />,
        );

        expect(scrollIntoView).not.toHaveBeenCalled();

        rerender(<Days weekKey="2026-11-16" showsToday ready />);

        expect(scrollIntoView).toHaveBeenCalledWith({
            block: 'start',
            behavior: 'smooth',
        });
    });

    it('starts another week at its top, but not on load', () => {
        const { rerender } = render(
            <Days weekKey="2026-11-09" showsToday={false} ready />,
        );

        expect(scrollTo).not.toHaveBeenCalled();

        rerender(<Days weekKey="2026-11-02" showsToday={false} ready />);

        expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'instant' });
        expect(scrollIntoView).not.toHaveBeenCalled();
    });

    it('does not animate when the user prefers reduced motion', () => {
        reducedMotion = true;
        const { rerender } = render(
            <Days weekKey="2026-11-09" showsToday={false} ready />,
        );

        rerender(<Days weekKey="2026-11-16" showsToday ready />);

        expect(scrollIntoView).toHaveBeenCalledWith({
            block: 'start',
            behavior: 'instant',
        });
    });

    it('leaves the desktop grid alone', () => {
        stacked = false;
        render(<Days weekKey="2026-11-16" showsToday ready />);

        expect(scrollIntoView).not.toHaveBeenCalled();
    });
});
