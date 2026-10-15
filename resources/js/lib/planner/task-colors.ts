import type { TaskColor } from '@/lib/db/types';

export type TaskColorStyle = {
    /** Human label for pickers and screen readers. */
    label: string;
    /** Classes for the pill around the task text ('' for no pill). */
    pill: string;
    /** Classes for a color swatch (pickers). */
    swatch: string;
};

/**
 * The single source of truth for how task colors look. Values come from the
 * `--task-*` tokens in resources/css/app.css (light and dark), documented in
 * docs/style.md. Class names are literal so Tailwind can find them.
 */
export const TASK_COLOR_STYLES: Record<TaskColor, TaskColorStyle> = {
    none: {
        label: 'No color',
        pill: '',
        swatch: 'border border-border bg-background',
    },
    pink: {
        label: 'Pink',
        pill: 'bg-task-pink text-task-pink-foreground',
        swatch: 'bg-task-pink',
    },
    yellow: {
        label: 'Yellow',
        pill: 'bg-task-yellow text-task-yellow-foreground',
        swatch: 'bg-task-yellow',
    },
    black: {
        label: 'Black',
        pill: 'bg-task-black text-task-black-foreground',
        swatch: 'bg-task-black',
    },
    grey: {
        label: 'Grey',
        pill: 'bg-task-grey text-task-grey-foreground',
        swatch: 'bg-task-grey',
    },
    cornflower: {
        label: 'Cornflower',
        pill: 'bg-task-cornflower text-task-cornflower-foreground',
        swatch: 'bg-task-cornflower',
    },
    mango: {
        label: 'Mango',
        pill: 'bg-task-mango text-task-mango-foreground',
        swatch: 'bg-task-mango',
    },
    green: {
        label: 'Green',
        pill: 'bg-task-green text-task-green-foreground',
        swatch: 'bg-task-green',
    },
    lilac: {
        label: 'Lilac',
        pill: 'bg-task-lilac text-task-lilac-foreground',
        swatch: 'bg-task-lilac',
    },
};
