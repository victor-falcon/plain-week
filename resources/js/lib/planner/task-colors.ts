import { t } from '@/lib/i18n';
import { TASK_COLORS } from '@/lib/db/types';
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
        get label() {
            return t('planner.colorNone');
        },
        pill: '',
        swatch: 'border border-foreground/40',
    },
    pink: {
        get label() {
            return t('planner.colorPink');
        },
        pill: 'bg-task-pink text-task-pink-foreground',
        swatch: 'bg-task-pink',
    },
    yellow: {
        get label() {
            return t('planner.colorYellow');
        },
        pill: 'bg-task-yellow text-task-yellow-foreground',
        swatch: 'bg-task-yellow',
    },
    black: {
        get label() {
            return t('planner.colorBlack');
        },
        pill: 'bg-task-black text-task-black-foreground',
        swatch: 'bg-task-black',
    },
    grey: {
        get label() {
            return t('planner.colorGrey');
        },
        pill: 'bg-task-grey text-task-grey-foreground',
        swatch: 'bg-task-grey',
    },
    cornflower: {
        get label() {
            return t('planner.colorCornflower');
        },
        pill: 'bg-task-cornflower text-task-cornflower-foreground',
        swatch: 'bg-task-cornflower',
    },
    mango: {
        get label() {
            return t('planner.colorMango');
        },
        pill: 'bg-task-mango text-task-mango-foreground',
        swatch: 'bg-task-mango',
    },
    green: {
        get label() {
            return t('planner.colorGreen');
        },
        pill: 'bg-task-green text-task-green-foreground',
        swatch: 'bg-task-green',
    },
    lilac: {
        get label() {
            return t('planner.colorLilac');
        },
        pill: 'bg-task-lilac text-task-lilac-foreground',
        swatch: 'bg-task-lilac',
    },
};

export function isTaskColor(value: string): value is TaskColor {
    return (TASK_COLORS as readonly string[]).includes(value);
}
