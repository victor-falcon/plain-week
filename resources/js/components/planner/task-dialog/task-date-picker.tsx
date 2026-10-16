import { CalendarDays } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';
import { parseDateKey, toDateKey } from '@/lib/db/dates';
import { moveTask } from '@/lib/db/tasks';
import { formatLongDate, formatShortDate } from '@/lib/planner/format';
import { useTaskEditor } from './task-editor';
import { useToolbarPicker } from './toolbar-picker';
import { TOOLBAR_BUTTON_CLASS, ToolbarTooltip } from './toolbar-tooltip';

/**
 * A calendar popover's `onOpenAutoFocus`: focus goes to its day in the tab
 * order (the selected day, else today) instead of its first button (the
 * previous month), so the arrow keys pick a day at once.
 */
export function focusCalendarDay(event: Event): void {
    const day = (event.currentTarget as HTMLElement).querySelector<HTMLElement>(
        '[role="grid"] button[tabindex="0"]',
    );

    if (day) {
        event.preventDefault();
        day.focus();
    }
}

/**
 * The task's date ("Mon, 12 Oct 2026", or "Someday"). It opens a calendar
 * (weeks start on Monday); picking a day moves the task to the end of it.
 * Moving an occurrence moves only that one. A series row (shown when a new
 * rule skips the task's own day) cannot be moved.
 */
export function TaskDatePicker() {
    const { task, write } = useTaskEditor();
    const { open, onOpenChange } = useToolbarPicker('date');
    const disabled = task.kind === 'series';
    const selected = task.date ? parseDateKey(task.date) : undefined;
    const label = task.date ? formatLongDate(task.date) : 'Someday';
    // Phones show "12 Oct" so the toolbar stays on one line.
    const shortLabel = task.date ? formatShortDate(task.date) : 'Someday';

    const handleSelect = (date: Date | undefined) => {
        onOpenChange(false);

        if (date && toDateKey(date) !== task.date) {
            write((id) => moveTask(id, { date: toDateKey(date) }), {
                follow: true,
                error: 'Could not move the task.',
            });
        }
    };

    return (
        <Popover open={open && !disabled} onOpenChange={onOpenChange}>
            <ToolbarTooltip label="Date" action="dialog.date">
                <PopoverTrigger asChild>
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        aria-label={`Date: ${label}`}
                        disabled={disabled}
                        className={`${TOOLBAR_BUTTON_CLASS} min-w-0 shrink font-medium`}
                    >
                        <CalendarDays data-icon="inline-start" />
                        <span className="min-w-0 truncate sm:hidden">
                            {shortLabel}
                        </span>
                        <span className="min-w-0 truncate max-sm:hidden">
                            {label}
                        </span>
                    </Button>
                </PopoverTrigger>
            </ToolbarTooltip>
            <PopoverContent
                align="start"
                onOpenAutoFocus={focusCalendarDay}
                className="w-auto p-0"
            >
                <Calendar
                    mode="single"
                    weekStartsOn={1}
                    selected={selected}
                    defaultMonth={selected}
                    onSelect={handleSelect}
                />
            </PopoverContent>
        </Popover>
    );
}
