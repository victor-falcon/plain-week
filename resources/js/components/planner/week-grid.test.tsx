// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test';
import { ScopePromptProvider } from '@/components/planner/scope-prompt';
import { WeekGrid } from '@/components/planner/week-grid';
import { wipeLocalDatabase } from '@/lib/db/database';

describe('WeekGrid', () => {
    beforeEach(() => wipeLocalDatabase());
    afterEach(cleanup);

    it('lists the days in reading order, then Someday spanning the last three tracks', async () => {
        render(
            <ScopePromptProvider>
                <WeekGrid
                    weekStart={new Date(2026, 9, 12)}
                    today="2026-10-15"
                    onOpenTask={() => {}}
                />
            </ScopePromptProvider>,
        );

        // The five-track grid places its children in DOM order: Monday to
        // Friday on top, then Saturday, Sunday and Someday (three tracks).
        const sections = await screen.findAllByRole('region');

        expect(
            sections.map(
                (section) =>
                    section.getAttribute('aria-label') ??
                    section.textContent?.slice(0, 7),
            ),
        ).toEqual([
            'Mon 12 Oct',
            'Tue 13 Oct',
            'Wed 14 Oct',
            'Thu 15 Oct',
            'Fri 16 Oct',
            'Sat 17 Oct',
            'Sun 18 Oct',
            'Someday',
        ]);
        expect(sections[0].parentElement?.className).toContain(
            'lg:grid-cols-5',
        );
        expect(sections[7].className).toContain('lg:col-span-3');
    });
});
