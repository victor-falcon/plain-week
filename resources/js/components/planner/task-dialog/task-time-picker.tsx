import { Clock } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';
import { updateTask } from '@/lib/db/tasks';
import type { Task } from '@/lib/db/types';
import { cn } from '@/lib/utils';
import { saveLocally } from './save-locally';
import { TOOLBAR_BUTTON_CLASS } from './toolbar-tooltip';

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * The task's time (24-hour 'HH:mm'). The button shows only a clock until a
 * time is set; its popover sets the time as it is typed, or clears it.
 */
export function TaskTimePicker({ task }: { task: Task }) {
    const [open, setOpen] = useState(false);

    const handleChange = (value: string) => {
        // The native field reports '' once it is cleared.
        const time = TIME_PATTERN.test(value) ? value : null;

        if ((value === '' || time !== null) && time !== task.time) {
            saveLocally(updateTask(task.id, { time }));
        }
    };

    const handleClear = () => {
        setOpen(false);
        saveLocally(updateTask(task.id, { time: null }));
    };

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    type="button"
                    variant="ghost"
                    size={task.time ? 'sm' : 'icon-sm'}
                    aria-label={task.time ? `Time: ${task.time}` : 'Set time'}
                    className={cn(
                        TOOLBAR_BUTTON_CLASS,
                        'font-medium tabular-nums',
                    )}
                >
                    <Clock data-icon={task.time ? 'inline-start' : undefined} />
                    {task.time}
                </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-auto flex-row gap-2">
                <Input
                    type="time"
                    aria-label="Time"
                    step={60}
                    defaultValue={task.time ?? ''}
                    onChange={(event) => handleChange(event.target.value)}
                    className="w-32 tabular-nums"
                />
                <Button
                    type="button"
                    variant="ghost"
                    onClick={handleClear}
                    disabled={!task.time}
                >
                    Clear
                </Button>
            </PopoverContent>
        </Popover>
    );
}
