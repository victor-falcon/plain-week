import { DayColumn } from '@/components/planner/day-column';
import { useWeekTasks } from '@/hooks/use-tasks';
import { weekColumns } from '@/lib/planner/week';

type Props = {
    weekStart: Date;
    /** 'YYYY-MM-DD' of today, to highlight it. */
    today: string;
    onOpenTask: (taskId: string) => void;
};

/**
 * The week: six equal columns on desktop (Monday to Friday, then Saturday
 * stacked over Sunday), a single column of days on smaller screens.
 */
export function WeekGrid({ weekStart, today, onOpenTask }: Props) {
    const tasks = useWeekTasks(weekStart);

    return (
        <div className="grid grid-cols-1 gap-x-6 gap-y-10 lg:grid-cols-6">
            {weekColumns(weekStart).map((days) => (
                <div
                    key={days[0].date}
                    className="flex min-w-0 flex-col gap-10 lg:gap-8"
                >
                    {days.map(({ date, rows }) => (
                        <DayColumn
                            key={date}
                            date={date}
                            tasks={tasks?.[date]}
                            rows={rows}
                            isToday={date === today}
                            onOpenTask={onOpenTask}
                        />
                    ))}
                </div>
            ))}
        </div>
    );
}
