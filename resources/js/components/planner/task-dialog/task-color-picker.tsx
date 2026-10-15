import { TaskColorSwatch } from '@/components/planner/task-color-swatch';
import { Button } from '@/components/ui/button';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { TASK_COLORS } from '@/lib/db/types';
import { updateTask } from '@/lib/db/tasks';
import { TASK_COLOR_STYLES, isTaskColor } from '@/lib/planner/task-colors';
import { cn } from '@/lib/utils';
import { useTaskEditor } from './task-editor';
import { TOOLBAR_BUTTON_CLASS, ToolbarTooltip } from './toolbar-tooltip';

/**
 * Toolbar button showing the task's color as a dot. Its popover holds the
 * nine swatches; the current one is checked.
 */
export function TaskColorPicker() {
    const { task, edit } = useTaskEditor();
    const current = TASK_COLOR_STYLES[task.color];

    return (
        <Popover>
            <ToolbarTooltip label="Color">
                <PopoverTrigger asChild>
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Color: ${current.label}`}
                        className={cn(TOOLBAR_BUTTON_CLASS, 'group/color')}
                    >
                        <span
                            className={cn(
                                'size-4 rounded-full group-aria-expanded/color:ring-2 group-aria-expanded/color:ring-background',
                                task.color === 'none'
                                    ? 'border-2 border-current'
                                    : current.swatch,
                            )}
                        />
                    </Button>
                </PopoverTrigger>
            </ToolbarTooltip>
            <PopoverContent align="end" className="w-auto p-2">
                <ToggleGroup
                    type="single"
                    aria-label="Task color"
                    value={task.color}
                    onValueChange={(value) => {
                        // Radix sends '' when the current item is clicked again.
                        if (isTaskColor(value) && value !== task.color) {
                            edit((id, scope) =>
                                updateTask(id, { color: value }, { scope }),
                            );
                        }
                    }}
                    spacing={1}
                    className="grid grid-cols-5"
                >
                    {TASK_COLORS.map((color) => (
                        <ToggleGroupItem
                            key={color}
                            value={color}
                            aria-label={TASK_COLOR_STYLES[color].label}
                            className="size-9 rounded-full p-0 data-[state=on]:bg-transparent"
                        >
                            <TaskColorSwatch
                                color={color}
                                checked={color === task.color}
                            />
                        </ToggleGroupItem>
                    ))}
                </ToggleGroup>
            </PopoverContent>
        </Popover>
    );
}
