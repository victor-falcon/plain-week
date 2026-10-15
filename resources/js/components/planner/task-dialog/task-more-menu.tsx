import {
    ArrowDownToLine,
    ArrowRight,
    CalendarArrowUp,
    Copy,
    Ellipsis,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useToday } from '@/hooks/use-today';
import { duplicateTask, moveTask } from '@/lib/db/tasks';
import type { Task } from '@/lib/db/types';
import { nextWeekOf, tomorrowOf } from '@/lib/planner/quick-moves';
import { save, TOOLBAR_BUTTON_CLASS, ToolbarTooltip } from './toolbar';

/** Quick moves (Tomorrow, Next week, Someday) and Duplicate. */
export function TaskMoreMenu({ task }: { task: Task }) {
    const today = useToday();

    const handleDuplicate = () => {
        duplicateTask(task.id).then(
            () => toast.success('Task duplicated.'),
            () => toast.error('Could not duplicate the task.'),
        );
    };

    return (
        <DropdownMenu>
            <ToolbarTooltip label="More">
                <DropdownMenuTrigger asChild>
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label="More"
                        className={TOOLBAR_BUTTON_CLASS}
                    >
                        <Ellipsis />
                    </Button>
                </DropdownMenuTrigger>
            </ToolbarTooltip>
            <DropdownMenuContent align="end" className="min-w-40">
                <DropdownMenuItem
                    onSelect={() =>
                        save(
                            moveTask(task.id, {
                                date: tomorrowOf(task.date, today),
                            }),
                        )
                    }
                >
                    Tomorrow
                    <ArrowRight className="ms-auto rtl:rotate-180" />
                </DropdownMenuItem>
                <DropdownMenuItem
                    onSelect={() =>
                        save(
                            moveTask(task.id, {
                                date: nextWeekOf(task.date, today),
                            }),
                        )
                    }
                >
                    Next week
                    <CalendarArrowUp className="ms-auto" />
                </DropdownMenuItem>
                <DropdownMenuItem
                    disabled={task.date === null}
                    onSelect={() =>
                        save(
                            moveTask(task.id, {
                                date: null,
                                someday_column: 0,
                            }),
                        )
                    }
                >
                    Someday
                    <ArrowDownToLine className="ms-auto" />
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={handleDuplicate}>
                    Duplicate
                    <Copy className="ms-auto" />
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
