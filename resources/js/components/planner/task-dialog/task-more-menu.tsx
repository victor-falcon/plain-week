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
import type { MoveTaskInput } from '@/lib/db/tasks';
import {
    SOMEDAY_MOVE,
    duplicateWithToast,
    moveWithUndo,
    nextWeekMove,
    tomorrowMove,
} from '@/lib/planner/task-actions';
import { useTaskEditor } from './task-editor';
import { TOOLBAR_BUTTON_CLASS, ToolbarTooltip } from './toolbar-tooltip';

/**
 * Quick moves (Tomorrow, Next week, Someday; an occurrence moves alone, with
 * an "Undo" toast) and Duplicate (always a one-off copy).
 */
export function TaskMoreMenu() {
    const { task, write } = useTaskEditor();
    const canMove = task.kind !== 'series';
    const move = (input: MoveTaskInput) =>
        write((id) => moveWithUndo(id, input), { follow: true });

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
                    disabled={!canMove}
                    onSelect={() => move(tomorrowMove(task))}
                >
                    Tomorrow
                    <ArrowRight className="ms-auto rtl:rotate-180" />
                </DropdownMenuItem>
                <DropdownMenuItem
                    disabled={!canMove}
                    onSelect={() => move(nextWeekMove(task))}
                >
                    Next week
                    <CalendarArrowUp className="ms-auto" />
                </DropdownMenuItem>
                <DropdownMenuItem
                    disabled={!canMove || task.date === null}
                    onSelect={() => move(SOMEDAY_MOVE)}
                >
                    Someday
                    <ArrowDownToLine className="ms-auto" />
                </DropdownMenuItem>
                <DropdownMenuItem
                    onSelect={() => write((id) => duplicateWithToast(id))}
                >
                    Duplicate
                    <Copy className="ms-auto" />
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
