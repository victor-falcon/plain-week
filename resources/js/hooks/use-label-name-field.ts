import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { normalizeLabelName } from '@/lib/db/labels';
import type { LabelColor } from '@/lib/db/types';
import {
    defaultLabelName,
    labelKey,
    validateLabelNames,
} from '@/lib/planner/task-labels';
import type { LabelNameError, TaskLabelView } from '@/lib/planner/task-labels';

/** How long typing pauses before a valid name is saved. */
const SAVE_DELAY_MS = 400;

type SaveLabelName = (color: LabelColor, name: string) => Promise<void>;

/**
 * The error for `name` typed for `color`, checked against the names the
 * other colors have now (not against other fields' unsaved edits).
 */
export function labelNameError(
    color: LabelColor,
    name: string,
    labels: readonly TaskLabelView[],
): LabelNameError | undefined {
    const names: Partial<Record<LabelColor, string>> = {};
    labels.forEach((label) => {
        names[label.color] = label.customName ?? '';
    });
    names[color] = name;

    return validateLabelNames(names)[color];
}

/**
 * The name to store for what was typed: `''` (the default name) for an empty
 * field or the color's own name.
 */
function nameToStore(color: LabelColor, typed: string): string {
    const name = normalizeLabelName(typed);

    return labelKey(name) === labelKey(defaultLabelName(color)) ? '' : name;
}

/**
 * The state of one label's name field in Settings › Labels. The field shows
 * the typed text (the draft) until the stored name catches up; after that it
 * follows the stored name, so a rename synced from another device shows up.
 * A valid draft is saved once typing pauses, on blur or Enter, and when the
 * page is left; an invalid one stays in the field with its error and is
 * never saved.
 */
export function useLabelNameField(
    label: TaskLabelView,
    labels: readonly TaskLabelView[],
    onSave: SaveLabelName,
    inputRef: RefObject<HTMLInputElement | null>,
) {
    const { color } = label;
    const [draft, setDraft] = useState<string | null>(null);
    const [focused, setFocused] = useState(false);
    const value = draft ?? label.customName ?? '';
    const error = labelNameError(color, value, labels);
    // The valid name waiting for typing to pause, and its timer.
    const pending = useRef<string | null>(null);
    const timer = useRef<number | undefined>(undefined);

    // A stored name that changes while the field is not being edited (the
    // save landed, or a rename synced) replaces the typed text.
    const [stored, setStored] = useState(label.customName);
    if (label.customName !== stored) {
        setStored(label.customName);

        if (!focused) {
            setDraft(null);
        }
    }

    const cancelPending = () => {
        window.clearTimeout(timer.current);
        pending.current = null;
    };

    const save = (name: string) => {
        cancelPending();
        // Setting the name it already has writes nothing.
        void onSave(color, name).catch((reason: unknown) => {
            console.warn('Could not save the label name.', reason);
        });
    };

    // Leaving the page saves what is still waiting.
    useEffect(
        () => () => {
            window.clearTimeout(timer.current);

            if (pending.current !== null) {
                void onSave(color, pending.current).catch(() => {});
            }
        },
        [color, onSave],
    );

    const onChange = (typed: string) => {
        setDraft(typed);
        cancelPending();

        if (labelNameError(color, typed, labels)) {
            return;
        }

        const name = nameToStore(color, typed);
        pending.current = name;
        timer.current = window.setTimeout(() => save(name), SAVE_DELAY_MS);
    };

    const commit = () => {
        if (draft === null || error) {
            return;
        }

        const name = nameToStore(color, draft);
        save(name);

        // Nothing changes: the stored name will not come back to clear it.
        if (name === (label.customName ?? '')) {
            setDraft(null);
        }
    };

    const reset = () => {
        setDraft(null);
        save('');
        // The reset button goes away: keep focus in the row.
        inputRef.current?.focus();
    };

    return {
        value,
        error,
        /** The name the tag shows: the valid draft, else the stored name. */
        shownName:
            draft !== null && !error
                ? nameToStore(color, draft) || defaultLabelName(color)
                : label.name,
        onChange,
        onFocus: () => setFocused(true),
        onBlur: () => {
            setFocused(false);
            commit();
        },
        commit,
        reset,
    };
}
