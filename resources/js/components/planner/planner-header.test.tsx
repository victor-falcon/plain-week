// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { PlannerHeader } from '@/components/planner/planner-header';
import { TooltipProvider } from '@/components/ui/tooltip';

vi.mock('@/components/planner/account-button', () => ({
    AccountButton: () => null,
}));

function renderHeader(isCurrentWeek: boolean) {
    const onToday = vi.fn();

    render(
        <TooltipProvider>
            <PlannerHeader
                weekStart={new Date(2026, 10, 9)}
                isCurrentWeek={isCurrentWeek}
                onPreviousWeek={() => {}}
                onNextWeek={() => {}}
                onToday={onToday}
            />
        </TooltipProvider>,
    );

    return onToday;
}

describe('PlannerHeader', () => {
    afterEach(cleanup);

    it('has no Today button on the current week', () => {
        renderHeader(true);

        expect(screen.queryByRole('button', { name: 'Today' })).toBeNull();
    });

    it('shows a Today button next to the week number on another week', () => {
        const onToday = renderHeader(false);

        fireEvent.click(screen.getByRole('button', { name: 'Today' }));

        expect(onToday).toHaveBeenCalledOnce();
        // The week number gives the pill its room on phones.
        expect(screen.getByText('W46').parentElement?.className).toContain(
            'max-sm:hidden',
        );
    });
});
