import { Head } from '@inertiajs/react';
import { RotateCcw } from 'lucide-react';
import { useRef } from 'react';
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
import { useLabelNameField } from '@/hooks/use-label-name-field';
import { useTaskLabels } from '@/hooks/use-task-labels';
import { normalizeLabelName } from '@/lib/db/labels';
import { MAX_LABEL_NAME_LENGTH } from '@/lib/db/types';
import type { LabelColor } from '@/lib/db/types';
import { t } from '@/lib/i18n';
import {
    defaultLabelName,
    labelKey,
    labelTag,
} from '@/lib/planner/task-labels';
import type { LabelNameError, TaskLabelView } from '@/lib/planner/task-labels';
import { TASK_COLOR_STYLES } from '@/lib/planner/task-colors';
import { cn } from '@/lib/utils';

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
 * One label: swatch, color name, the name field (`useLabelNameField`), the
 * tag it gives and a reset button while it has a custom name.
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
    const inputRef = useRef<HTMLInputElement>(null);
    const field = useLabelNameField(label, labels, onSave, inputRef);
    const colorName = defaultLabelName(color);
    const inputId = `label-${color}`;
    const errorId = `${inputId}-error`;
    const tag = `#${labelTag(field.shownName)}`;

    return (
        <li
            className="flex flex-col gap-2 p-3 sm:flex-row sm:items-start sm:gap-3"
            data-test={`label-row-${color}`}
        >
            <div className="flex items-center gap-2 sm:h-9 sm:w-28 sm:shrink-0">
                <span
                    aria-hidden
                    className={cn(
                        'size-4 shrink-0 rounded-full',
                        TASK_COLOR_STYLES[color].swatch,
                    )}
                />
                <Label htmlFor={inputId}>{colorName}</Label>
            </div>
            <div className="flex min-w-0 flex-1 items-start gap-2">
                <div className="min-w-0 flex-1 space-y-1">
                    <Input
                        ref={inputRef}
                        id={inputId}
                        value={field.value}
                        placeholder={colorName}
                        maxLength={MAX_LABEL_NAME_LENGTH}
                        autoComplete="off"
                        spellCheck={false}
                        aria-invalid={field.error ? true : undefined}
                        aria-describedby={field.error ? errorId : undefined}
                        onChange={(event) => field.onChange(event.target.value)}
                        onFocus={field.onFocus}
                        onBlur={field.onBlur}
                        onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                                field.commit();
                            }
                        }}
                    />
                    <InputError
                        id={errorId}
                        message={
                            field.error
                                ? errorMessage(
                                      field.error,
                                      color,
                                      field.value,
                                      labels,
                                  )
                                : undefined
                        }
                    />
                </div>
                <span
                    className="h-9 w-24 shrink-0 truncate font-mono text-xs leading-9 text-muted-foreground"
                    title={tag}
                    data-test={`label-tag-${color}`}
                >
                    {tag}
                </span>
                <div className="size-9 shrink-0">
                    {label.isCustom && (
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    aria-label={t('labels.reset', {
                                        color: colorName,
                                    })}
                                    onClick={field.reset}
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
