import { isLabelNameTooLong, normalizeLabelName } from '@/lib/db/labels';
import { LABEL_COLORS } from '@/lib/db/types';
import type { LabelColor, TaskLabel } from '@/lib/db/types';
import { TASK_COLOR_STYLES } from './task-colors';

/**
 * A task colour as a named label, for the UI: `name` is what to show (the
 * user's name, or the colour's translated default).
 */
export type TaskLabelView = {
    color: LabelColor;
    name: string;
    /** The name the user gave it, or null when it has the default name. */
    customName: string | null;
    isCustom: boolean;
};

export type LabelNameError = 'duplicate' | 'reserved' | 'tooLong' | 'invalid';

/** The colour's translated name ("Pink"), used until the user renames it. */
export function defaultLabelName(color: LabelColor): string {
    return TASK_COLOR_STYLES[color].label;
}

/** Every label colour, in picker order, with its effective name. */
export function resolveLabels(stored: readonly TaskLabel[]): TaskLabelView[] {
    const names = new Map(stored.map((label) => [label.color, label.name]));

    return LABEL_COLORS.map((color) => {
        const customName = normalizeLabelName(names.get(color) ?? '') || null;

        return {
            color,
            name: customName ?? defaultLabelName(color),
            customName,
            isCustom: customName !== null,
        };
    });
}

/** The slug typed after `#`: lowercase, whitespace as `-` ("Deep work" → `deep-work`). */
export function labelTag(name: string): string {
    return normalizeLabelName(name).toLowerCase().replace(/ /g, '-');
}

/** The key names and tags are matched by: lowercase, without spaces or hyphens. */
export function labelKey(value: string): string {
    return value.toLowerCase().replace(/[\s-]+/g, '');
}

/**
 * The label `query` (the text after `#`) names: its colour
 * id always matches, even after a rename (`pink`), then its effective name
 * (`deep-work`, `Deep work`). Null when none does.
 */
export function findLabel<T extends Pick<TaskLabelView, 'color' | 'name'>>(
    query: string,
    labels: readonly T[],
): T | null {
    const key = labelKey(query);

    if (key === '') {
        return null;
    }

    return (
        labels.find((label) => label.color === key) ??
        labels.find((label) => labelKey(label.name) === key) ??
        null
    );
}

/**
 * Checks names being edited (by colour; `''` or absent keeps the default
 * name). A custom name is refused when it is too long, has no letters left
 * to match a tag by (`invalid`: only hyphens), matches another
 * colour's id or default name (`reserved`: `#green` always means green), or
 * matches another custom name (`duplicate`), comparing with `labelKey`.
 * Colours left with their default name never get an error.
 */
export function validateLabelNames(
    names: Partial<Record<LabelColor, string>>,
): Partial<Record<LabelColor, LabelNameError>> {
    const errors: Partial<Record<LabelColor, LabelNameError>> = {};
    const custom = new Map<LabelColor, string>();

    LABEL_COLORS.forEach((color) => {
        const name = normalizeLabelName(names[color] ?? '');

        if (name !== '') {
            custom.set(color, name);
        }
    });

    custom.forEach((name, color) => {
        const key = labelKey(name);
        const others = LABEL_COLORS.filter((other) => other !== color);

        if (isLabelNameTooLong(name)) {
            errors[color] = 'tooLong';
        } else if (key === '') {
            errors[color] = 'invalid';
        } else if (
            others.some(
                (other) =>
                    key === labelKey(other) ||
                    key === labelKey(defaultLabelName(other)),
            )
        ) {
            errors[color] = 'reserved';
        } else if (
            [...custom].some(
                ([other, otherName]) =>
                    other !== color && labelKey(otherName) === key,
            )
        ) {
            errors[color] = 'duplicate';
        }
    });

    return errors;
}
