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
import type { TaskPlacement } from '@/lib/db/tasks';
import { SOMEDAY_COLUMNS } from '@/lib/db/types';
import type { Task } from '@/lib/db/types';
import { nextWeekOf, tomorrowOf } from '@/lib/planner/quick-moves';
import { saveLocally } from './save-locally';
import { TOOLBAR_BUTTON_CLASS, ToolbarTooltip } from './toolbar-tooltip';

/** Quick moves (Tomorrow, Next week, Someday) and Duplicate. */
export function TaskMoreMenu({ task }: { task: Task }) {
    const today = useToday();

    const move = (placement: TaskPlacement) =>
        saveLocally(moveTask(task.id, placement));

    const handleDuplicate = () =>
        saveLocally(duplicateTask(task.id), {
            error: 'Could not duplicate the task.',
            onSaved: () => toast.success('Task duplicated.'),
        });

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
                        move({
                            date: tomorrowOf(task.date, today),
                        })
                    }
                >
                    Tomorrow
                    <ArrowRight className="ms-auto rtl:rotate-180" />
                </DropdownMenuItem>
                <DropdownMenuItem
                    onSelect={() =>
                        move({
                            date: nextWeekOf(task.date, today),
                        })
                    }
                >
                    Next week
                    <CalendarArrowUp className="ms-auto" />
                </DropdownMenuItem>
                <DropdownMenuItem
                    disabled={task.date === null}
                    onSelect={() =>
                        move({
                            date: null,
                            someday_column: SOMEDAY_COLUMNS[0],
                        })
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
