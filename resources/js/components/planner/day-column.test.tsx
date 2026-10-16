// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vite-plus/test';
import { DayColumn } from '@/components/planner/day-column';
import { ScopePromptProvider } from '@/components/planner/scope-prompt';

function renderDay(isToday: boolean) {
    render(
        <ScopePromptProvider>
            <DayColumn
                date="2026-10-12"
                tasks={[]}
                rows={2}
                isToday={isToday}
                onOpenTask={() => {}}
            />
        </ScopePromptProvider>,
    );

    return screen.getByRole('region', { name: 'Mon 12 Oct' });
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
});
