import { CalendarDays } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';
import { parseDateKey, toDateKey } from '@/lib/db/dates';
import { moveTask } from '@/lib/db/tasks';
import type { Task } from '@/lib/db/types';
import { formatDay, formatLongDate, formatWeekday } from '@/lib/planner/format';
import { saveLocally } from './save-locally';
import { TOOLBAR_BUTTON_CLASS } from './toolbar-tooltip';

/**
 * The task's date ("Mon, 12 Oct 2026", "Mon, 12 Oct" on phones, or "Someday"). It opens a calendar
 * (weeks start on Monday); picking a day moves the task to the end of it.
 */
export function TaskDatePicker({ task }: { task: Task }) {
    const [open, setOpen] = useState(false);
    const selected = task.date ? parseDateKey(task.date) : undefined;
    const label = task.date ? formatLongDate(task.date) : 'Someday';
    // Phones drop the year so the toolbar stays on one line.
    const shortLabel = task.date
        ? `${formatWeekday(task.date)}, ${formatDay(task.date)}`
        : 'Someday';

    const handleSelect = (date: Date | undefined) => {
        setOpen(false);

        if (date && toDateKey(date) !== task.date) {
            saveLocally(moveTask(task.id, { date: toDateKey(date) }));
        }
    };

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label={`Date: ${label}`}
                    className={`${TOOLBAR_BUTTON_CLASS} font-medium`}
                >
                    <CalendarDays data-icon="inline-start" />
                    <span className="sm:hidden">{shortLabel}</span>
                    <span className="max-sm:hidden">{label}</span>
                </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-auto p-0">
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
