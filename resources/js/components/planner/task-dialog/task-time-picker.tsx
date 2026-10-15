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
import { cn } from '@/lib/utils';
import { useTaskEditor } from './task-editor';
import { TOOLBAR_BUTTON_CLASS } from './toolbar-tooltip';

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * The task's time (24-hour 'HH:mm'). The button shows only a clock until a
 * time is set; its popover sets the time as it is typed, or clears it.
 */
export function TaskTimePicker() {
    const { task, edit } = useTaskEditor();
    const [open, setOpen] = useState(false);

    const handleChange = (field: HTMLInputElement) => {
        const value = field.value;
        // The native field reports '' once it is cleared.
        const time = TIME_PATTERN.test(value) ? value : null;

        if ((value === '' || time !== null) && time !== task.time) {
            edit((id, scope) => updateTask(id, { time }, { scope }), {
                onCancel: () => {
                    field.value = task.time ?? '';
                },
            });
        }
    };

    const handleClear = () => {
        setOpen(false);
        edit((id, scope) => updateTask(id, { time: null }, { scope }));
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
                    onChange={(event) => handleChange(event.target)}
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
