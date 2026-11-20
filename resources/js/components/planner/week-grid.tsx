import { useRef } from 'react';
import { DayColumn } from '@/components/planner/day-column';
import { SomedaySection } from '@/components/planner/someday-section';
import { useScrollToToday } from '@/hooks/use-scroll-to-today';
import { useWeekTasks } from '@/hooks/use-tasks';
import { weekDateKeys } from '@/lib/db/dates';
import { cn } from '@/lib/utils';

type Props = {
    weekStart: Date;
    /** 'YYYY-MM-DD' of today, to highlight it. */
    today: string;
    onOpenTask: (taskId: string) => void;
};

/**
 * The week and Someday on one grid that fills the window on desktop, laid
 * out by the window's shape (`week-*` variants in `app.css`):
 *
 * - wide: five tracks, Monday to Friday on top; below them Saturday under
 *   Monday, Sunday under Tuesday and Someday spanning Wednesday to Friday;
 * - near square: four tracks, Monday to Thursday, then Friday, Saturday,
 *   Sunday and Someday;
 * - tall: three tracks, Monday to Wednesday, Thursday to Saturday, then
 *   Sunday and Someday spanning two.
 *
 * Every cell takes its share of the height and scrolls its own list; rows
 * keep a minimum height, so a very short window scrolls the page. Smaller
 * screens show a single column: the days in order, then Someday. The DOM
 * keeps that reading order (Monday to Sunday, then Someday) on every screen,
 * and scrolls to today there when the current week is shown (to the top on
 * another week).
 */
export function WeekGrid({ weekStart, today, onOpenTask }: Props) {
    const tasks = useWeekTasks(weekStart);
    const grid = useRef<HTMLDivElement>(null);
    const days = weekDateKeys(weekStart);
    // Right after a week change `tasks` still holds the previous week's days.
    const loaded = tasks?.[days[0]] !== undefined;
    useScrollToToday(grid, {
        weekStartKey: days[0],
        showsToday: days.includes(today),
        ready: loaded,
    });

    return (
        <div
            ref={grid}
            className={cn(
                'grid grid-cols-1 gap-x-6 gap-y-10 lg:min-h-0 lg:flex-1 lg:gap-y-8',
                'lg:week-wide:grid-cols-5 lg:week-wide:grid-rows-[minmax(14rem,3fr)_minmax(10rem,2fr)]',
                'lg:week-square:grid-cols-4 lg:week-square:grid-rows-[repeat(2,minmax(12rem,1fr))]',
                'lg:week-tall:grid-cols-3 lg:week-tall:grid-rows-[repeat(3,minmax(12rem,1fr))]',
            )}
        >
            {days.map((date) => (
                <DayColumn
                    key={date}
                    date={date}
                    tasks={tasks?.[date]}
                    isToday={date === today}
                    onOpenTask={onOpenTask}
                />
            ))}
            <SomedaySection
                weekStart={weekStart}
                today={today}
                onOpenTask={onOpenTask}
                className="lg:week-wide:col-span-3 lg:week-tall:col-span-2"
            />
        </div>
    );
}
