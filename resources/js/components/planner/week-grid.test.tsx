// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test';
import { ScopePromptProvider } from '@/components/planner/scope-prompt';
import { WeekGrid } from '@/components/planner/week-grid';
import { wipeLocalDatabase } from '@/lib/db/database';

describe('WeekGrid', () => {
    beforeEach(() => wipeLocalDatabase());
    afterEach(cleanup);

    it('lists the days in reading order, then Someday, on every window shape', async () => {
        render(
            <ScopePromptProvider>
                <WeekGrid
                    weekStart={new Date(2026, 9, 12)}
                    today="2026-10-15"
                    onOpenTask={() => {}}
                />
            </ScopePromptProvider>,
        );

        // Every desktop grid places its children in DOM order: five tracks
        // with Someday spanning three (wide windows), four tracks (near
        // square) or three with Someday spanning two (tall).
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
        const grid = sections[0].parentElement?.className;
        expect(grid).toContain('lg:week-wide:grid-cols-5');
        expect(grid).toContain('lg:week-square:grid-cols-4');
        expect(grid).toContain('lg:week-tall:grid-cols-3');
        expect(sections[7].className).toContain('lg:week-wide:col-span-3');
        expect(sections[7].className).toContain('lg:week-tall:col-span-2');
    });
});
