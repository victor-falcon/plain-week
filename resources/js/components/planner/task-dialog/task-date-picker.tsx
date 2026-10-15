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
import { formatLongDate } from '@/lib/planner/format';
import { save, TOOLBAR_BUTTON_CLASS } from './toolbar';

/**
 * The task's date ("Mon, 12 Oct 2026" or "Someday"). It opens a calendar
 * (weeks start on Monday); picking a day moves the task to the end of it.
 */
export function TaskDatePicker({ task }: { task: Task }) {
    const [open, setOpen] = useState(false);
    const selected = task.date ? parseDateKey(task.date) : undefined;

    const handleSelect = (date: Date | undefined) => {
        setOpen(false);

        if (date && toDateKey(date) !== task.date) {
            save(moveTask(task.id, { date: toDateKey(date) }));
        }
    };

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label={`Date: ${task.date ? formatLongDate(task.date) : 'Someday'}`}
                    className={`${TOOLBAR_BUTTON_CLASS} font-medium`}
                >
                    <CalendarDays data-icon="inline-start" />
                    {task.date ? formatLongDate(task.date) : 'Someday'}
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
