import { DayColumn } from '@/components/planner/day-column';
import { SomedaySection } from '@/components/planner/someday-section';
import { useWeekTasks } from '@/hooks/use-tasks';
import { weekLayout } from '@/lib/planner/week';

type Props = {
    weekStart: Date;
    /** 'YYYY-MM-DD' of today, to highlight it. */
    today: string;
    onOpenTask: (taskId: string) => void;
};

/**
 * The week and Someday on one five-track grid. On desktop Monday to Friday
 * fill the top row; below them Saturday sits under Monday, Sunday under
 * Tuesday and Someday spans Wednesday to Friday. Smaller screens show a
 * single column: the days in order, then Someday. The DOM keeps that reading
 * order (Monday to Sunday, then Someday) on every screen.
 */
export function WeekGrid({ weekStart, today, onOpenTask }: Props) {
    const tasks = useWeekTasks(weekStart);
    const { weekdays, weekend } = weekLayout(weekStart);

    return (
        <div className="grid grid-cols-1 gap-x-6 gap-y-10 lg:grid-cols-5 lg:gap-y-12">
            {[...weekdays, ...weekend].map(({ date, rows }) => (
                <DayColumn
                    key={date}
                    date={date}
                    tasks={tasks?.[date]}
                    rows={rows}
                    isToday={date === today}
                    onOpenTask={onOpenTask}
                />
            ))}
            <SomedaySection
                weekStart={weekStart}
                today={today}
                onOpenTask={onOpenTask}
                className="lg:col-span-3"
            />
        </div>
    );
}
