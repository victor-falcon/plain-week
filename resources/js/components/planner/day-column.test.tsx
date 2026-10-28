// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vite-plus/test';
import { DayColumn } from '@/components/planner/day-column';
import { ScopePromptProvider } from '@/components/planner/scope-prompt';

function renderDay(isToday: boolean, date = '2026-10-12') {
    render(
        <ScopePromptProvider>
            <DayColumn
                date={date}
                tasks={[]}
                rows={2}
                isToday={isToday}
                onOpenTask={() => {}}
            />
        </ScopePromptProvider>,
    );

    return screen.getAllByRole('region')[0];
}

describe('DayColumn', () => {
    afterEach(cleanup);

    it('marks today with aria-current and the accent tint', () => {
        const section = renderDay(true);

        expect(section.getAttribute('aria-current')).toBe('date');
        expect(section.className).toContain('bg-planner-accent');
    });

    it('leaves other days untinted', () => {
        const section = renderDay(false);

        expect(section.hasAttribute('aria-current')).toBe(false);
        expect(section.className).not.toContain('bg-planner-accent');
    });

    it('gives weekend days a quieter header', () => {
        const header = renderDay(false, '2026-10-17').querySelector('h2');

        expect(header?.className).toContain('text-muted-foreground/70');
        expect(header?.className).toContain('border-muted-foreground/25');
    });

    it('keeps the accent on a weekend day that is today', () => {
        const header = renderDay(true, '2026-10-18').querySelector('h2');

        expect(header?.className).toContain('text-planner-accent');
        expect(header?.className).not.toContain('text-muted-foreground');
    });

    it('leaves weekday headers as they are', () => {
        const header = renderDay(false).querySelector('h2');

        expect(header?.className).not.toContain('text-muted-foreground');
    });
});
