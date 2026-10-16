import { TaskList } from '@/components/planner/task-list';
import type { PlannerTask } from '@/lib/recurrence/expand';
import { formatDay, formatWeekday } from '@/lib/planner/format';
import { cn } from '@/lib/utils';

type Props = {
    /** 'YYYY-MM-DD'. */
    date: string;
    tasks: PlannerTask[] | undefined;
    rows: number;
    isToday: boolean;
    onOpenTask: (taskId: string) => void;
    className?: string;
};

/** One day: its header ("12 Oct … Mon") over its ruled task list. */
export function DayColumn({
    date,
    tasks,
    rows,
    isToday,
    onOpenTask,
    className,
}: Props) {
    const dayLabel = formatDay(date);
    const weekday = formatWeekday(date);

    return (
        <section
            aria-label={`${weekday} ${dayLabel}`}
            aria-current={isToday ? 'date' : undefined}
            className={cn(
                'flex min-w-0 flex-col',
                // A soft tint that bleeds 10px past the start, end and top,
                // padded back so the header and rows stay in place. Sunday
                // sits right under Saturday on desktop, so it skips the top
                // bleed there instead of covering Saturday's last row.
                isToday &&
                    '-mx-2.5 -mt-2.5 rounded-t-lg bg-planner-accent/6 px-2.5 pt-2.5 lg:not-first:mt-0 lg:not-first:pt-0 dark:bg-planner-accent/10',
                className,
            )}
        >
            <h2
                className={cn(
                    'flex items-baseline justify-between gap-2 border-b-2 border-foreground pb-3 text-lg leading-7 lg:text-xl',
                    isToday && 'border-planner-accent text-planner-accent',
                )}
            >
                <span className="font-bold tracking-tight">{dayLabel}</span>
                <span
                    className={cn(
                        'text-muted-foreground/70',
                        isToday && 'text-planner-accent-muted',
                    )}
                >
                    {weekday}
                </span>
            </h2>
            <TaskList
                placement={{ date }}
                tasks={tasks}
                rows={rows}
                newTaskLabel={`New task for ${weekday} ${dayLabel}`}
                onOpenTask={onOpenTask}
            />
        </section>
    );
}
