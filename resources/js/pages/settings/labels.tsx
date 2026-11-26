import { Head } from '@inertiajs/react';
import { RotateCcw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import Heading from '@/components/heading';
import InputError from '@/components/input-error';
import { SyncProvider } from '@/components/sync-provider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from '@/components/ui/tooltip';
import { useTaskLabels } from '@/hooks/use-task-labels';
import { normalizeLabelName } from '@/lib/db/labels';
import { MAX_LABEL_NAME_LENGTH } from '@/lib/db/types';
import type { LabelColor } from '@/lib/db/types';
import { t } from '@/lib/i18n';
import {
    defaultLabelName,
    labelKey,
    labelTag,
    validateLabelNames,
} from '@/lib/planner/task-labels';
import type { LabelNameError, TaskLabelView } from '@/lib/planner/task-labels';
import { TASK_COLOR_STYLES } from '@/lib/planner/task-colors';

/** How long typing pauses before a valid name is saved. */
const SAVE_DELAY_MS = 400;

/**
 * Settings › Labels: a name for each task color, typed after `#` in a new
 * task to apply that color. Names live in IndexedDB and sync with the
 * account like tasks; a valid edit is saved locally as typing pauses, with
 * no save button.
 */
export default function Labels() {
    const { labels, isLoading, setLabelName } = useTaskLabels();

    return (
        <SyncProvider>
            <Head title={t('labels.title')} />

            <h1 className="sr-only">{t('labels.title')}</h1>

            <div className="space-y-6">
                <Heading
                    variant="small"
                    title={t('labels.title')}
                    description={t('labels.description')}
                />
                {/* Rows wait for the first local read, so a field never starts empty and then fills in. */}
                {!isLoading && (
                    <ul
                        className="divide-y rounded-lg border"
                        data-test="label-list"
                    >
                        {labels.map((label) => (
                            <LabelRow
                                key={label.color}
                                label={label}
                                labels={labels}
                                onSave={setLabelName}
                            />
                        ))}
                    </ul>
                )}
                <p className="text-sm text-muted-foreground">
                    {t('labels.footnote')}
                </p>
            </div>
        </SyncProvider>
    );
}

/**
 * The error for `name` typed for `color`, checked against the names the
 * other colors have now (not against other fields' unsaved edits).
 */
function nameError(
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

function errorMessage(
    error: LabelNameError,
    color: LabelColor,
    name: string,
    labels: readonly TaskLabelView[],
): string {
    switch (error) {
        case 'duplicate': {
            const other = labels.find(
                (label) =>
                    label.color !== color &&
                    labelKey(label.name) === labelKey(name),
            );

            return t('labels.errorDuplicate', {
                color: other ? defaultLabelName(other.color) : '',
            });
        }
        case 'reserved':
            return t('labels.errorReserved', {
                name: normalizeLabelName(name),
            });
        case 'tooLong':
            return t('labels.errorTooLong', { max: MAX_LABEL_NAME_LENGTH });
        case 'invalid':
            return t('labels.errorInvalid');
    }
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
 * One label: swatch, color name, the name field, the tag it gives and a
 * reset button while it has a custom name. The field shows the typed text
 * (`draft`) until the stored name catches up; after that it follows the
 * stored name, so a rename synced from another device shows up. An invalid
 * name stays in the field with its error and is not saved.
 */
function LabelRow({
    label,
    labels,
    onSave,
}: {
    label: TaskLabelView;
    labels: readonly TaskLabelView[];
    onSave: (color: LabelColor, name: string) => Promise<void>;
}) {
    const { color } = label;
    const [draft, setDraft] = useState<string | null>(null);
    const value = draft ?? label.customName ?? '';
    const error = nameError(color, value, labels);
    const pending = useRef<string | null>(null);
    const colorName = defaultLabelName(color);
    const inputId = `label-${color}`;
    const errorId = `${inputId}-error`;

    const save = (name: string) => {
        pending.current = null;

        if (name !== (label.customName ?? '')) {
            void onSave(color, name).catch((reason: unknown) => {
                console.warn('Could not save the label name.', reason);
            });
        }
    };

    // Save a valid edit once typing pauses.
    const target = draft !== null && !error ? nameToStore(color, draft) : null;
    useEffect(() => {
        if (target === null) {
            return;
        }

        pending.current = target;
        const timer = window.setTimeout(() => save(target), SAVE_DELAY_MS);

        return () => window.clearTimeout(timer);
        // `save` reads the latest stored name; only a new target reschedules.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [target]);

    // Leaving the page saves what is still waiting.
    const saveRef = useRef(save);
    saveRef.current = save;
    useEffect(
        () => () => {
            if (pending.current !== null) {
                saveRef.current(pending.current);
            }
        },
        [],
    );

    // A stored name that changes while the field is not being edited (the
    // save landed, or a rename synced) replaces the typed text.
    const [focused, setFocused] = useState(false);
    const [stored, setStored] = useState(label.customName);
    if (label.customName !== stored) {
        setStored(label.customName);

        if (!focused) {
            setDraft(null);
        }
    }

    const flush = () => {
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
        pending.current = null;
        setDraft(null);
        save('');
    };

    const shown =
        draft !== null && !error
            ? nameToStore(color, draft) || colorName
            : label.name;
    const canReset = value.trim() !== '' || label.isCustom;

    return (
        <li
            className="flex flex-col gap-2 p-3 sm:flex-row sm:items-start sm:gap-3"
            data-test={`label-row-${color}`}
        >
            <div className="flex items-center gap-2 sm:h-9 sm:w-28 sm:shrink-0">
                <span
                    aria-hidden
                    className={`size-4 shrink-0 rounded-full ${TASK_COLOR_STYLES[color].swatch}`}
                />
                <Label htmlFor={inputId}>{colorName}</Label>
            </div>
            <div className="flex min-w-0 flex-1 items-start gap-2">
                <div className="min-w-0 flex-1 space-y-1">
                    <Input
                        id={inputId}
                        value={value}
                        placeholder={colorName}
                        maxLength={MAX_LABEL_NAME_LENGTH}
                        autoComplete="off"
                        spellCheck={false}
                        aria-invalid={error ? true : undefined}
                        aria-describedby={error ? errorId : undefined}
                        onChange={(event) => setDraft(event.target.value)}
                        onFocus={() => setFocused(true)}
                        onBlur={() => {
                            setFocused(false);
                            flush();
                        }}
                        onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                                flush();
                            }
                        }}
                    />
                    <InputError
                        id={errorId}
                        message={
                            error
                                ? errorMessage(error, color, value, labels)
                                : undefined
                        }
                    />
                </div>
                <span
                    className="flex h-9 w-24 shrink-0 items-center truncate font-mono text-xs text-muted-foreground"
                    data-test={`label-tag-${color}`}
                >
                    #{labelTag(shown)}
                </span>
                <div className="size-9 shrink-0">
                    {canReset && (
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    aria-label={t('labels.reset', {
                                        color: colorName,
                                    })}
                                    onClick={reset}
                                >
                                    <RotateCcw />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                                {t('labels.resetTooltip')}
                            </TooltipContent>
                        </Tooltip>
                    )}
                </div>
            </div>
        </li>
    );
}
