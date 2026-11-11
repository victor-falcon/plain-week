import { TaskList } from '@/components/planner/task-list';
import { useSomedayTasks } from '@/hooks/use-tasks';
import { SOMEDAY_ROWS } from '@/lib/planner/week';
import { cn } from '@/lib/utils';

type Props = {
    weekStart: Date;
    /** 'YYYY-MM-DD' of today. */
    today: string;
    onOpenTask: (taskId: string) => void;
    className?: string;
};

const SOMEDAY_PLACEMENT = { date: null } as const;

/**
 * Undated tasks: one ruled list with a header like a day's, so it reads as a
 * sibling of Saturday and Sunday next to it. Tasks done in an earlier week
 * are archived and not shown.
 */
export function SomedaySection({
    weekStart,
    today,
    onOpenTask,
    className,
}: Props) {
    const tasks = useSomedayTasks(weekStart, today);

    return (
        <section
            aria-labelledby="someday-title"
            className={cn('flex min-w-0 flex-col', className)}
        >
            <h2
                id="someday-title"
                className="border-b-2 border-foreground pb-3 text-lg leading-7 font-bold tracking-tight lg:text-xl"
            >
                Someday
            </h2>
            <TaskList
                placement={SOMEDAY_PLACEMENT}
                tasks={tasks}
                rows={SOMEDAY_ROWS}
                newTaskLabel="New Someday task"
                onOpenTask={onOpenTask}
            />
        </section>
    );
}
