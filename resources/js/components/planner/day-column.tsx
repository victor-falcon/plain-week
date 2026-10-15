import { TaskList } from '@/components/planner/task-list';
import type { Task } from '@/lib/db/types';
import { formatDay, formatWeekday } from '@/lib/planner/format';
import { cn } from '@/lib/utils';

type Props = {
    /** 'YYYY-MM-DD'. */
    date: string;
    tasks: Task[] | undefined;
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
            className={cn('flex min-w-0 flex-col', className)}
        >
            <h2
                className={cn(
                    'flex items-baseline justify-between gap-2 border-b-2 border-foreground pb-3 text-lg leading-7 lg:text-xl',
                    isToday && 'border-primary text-primary',
                )}
            >
                <span className="font-bold tracking-tight">{dayLabel}</span>
                <span
                    className={cn(
                        'text-muted-foreground/70',
                        isToday && 'text-primary/60',
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
