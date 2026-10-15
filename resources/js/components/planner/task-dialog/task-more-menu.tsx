import {
    ArrowDownToLine,
    ArrowRight,
    CalendarArrowUp,
    Copy,
    Ellipsis,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { Task } from '@/lib/db/types';
import {
    duplicateWithToast,
    moveToNextWeek,
    moveToSomeday,
    moveToTomorrow,
} from '@/lib/planner/task-actions';
import { TOOLBAR_BUTTON_CLASS, ToolbarTooltip } from './toolbar-tooltip';

/** Quick moves (Tomorrow, Next week, Someday) and Duplicate. */
export function TaskMoreMenu({ task }: { task: Task }) {
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
                <DropdownMenuItem onSelect={() => moveToTomorrow(task)}>
                    Tomorrow
                    <ArrowRight className="ms-auto rtl:rotate-180" />
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => moveToNextWeek(task)}>
                    Next week
                    <CalendarArrowUp className="ms-auto" />
                </DropdownMenuItem>
                <DropdownMenuItem
                    disabled={task.date === null}
                    onSelect={() => moveToSomeday(task)}
                >
                    Someday
                    <ArrowDownToLine className="ms-auto" />
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => duplicateWithToast(task)}>
                    Duplicate
                    <Copy className="ms-auto" />
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
