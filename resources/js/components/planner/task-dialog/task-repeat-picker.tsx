import { Repeat, X } from 'lucide-react';
import { useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { parseDateKey, toDateKey } from '@/lib/db/dates';
import { setRecurrence } from '@/lib/db/tasks';
import { MAX_EVERY_DAYS } from '@/lib/db/types';
import type { IsoWeekday } from '@/lib/db/types';
import { formatLongDate } from '@/lib/planner/format';
import {
    ISO_WEEKDAYS,
    draftToRecurrence,
    repeatAnchor,
    repeatDraft,
    sameRecurrence,
    isSeriesStart,
    summarizeRecurrence,
    weekdayName,
} from '@/lib/planner/repeat';
import type { RepeatDraft } from '@/lib/planner/repeat';
import { isoWeekday } from '@/lib/recurrence/dates';
import {
    firstRuleDate,
    isRecurring,
    isValidEvery,
    occurrenceId,
} from '@/lib/recurrence/expand';
import { cn } from '@/lib/utils';
import { focusCalendarDay } from './task-date-picker';
import { useTaskEditor } from './task-editor';
import { useToolbarPicker } from './toolbar-picker';
import { TOOLBAR_BUTTON_CLASS, ToolbarTooltip } from './toolbar-tooltip';

const DAYS_OF_MONTH = Array.from({ length: 31 }, (_, i) => i + 1);

/** A selected toggle is filled, like the toolbar's open trigger. */
const SELECTED_CLASS =
    'data-[state=on]:bg-foreground data-[state=on]:text-background';

/**
 * The Repeat toolbar button. Its popover picks "Never", "Daily" every N days,
 * "Weekly" on some weekdays or "Monthly" on a day, and an optional end date;
 * "Apply" writes it.
 * A new rule starts on the task's date (an occurrence: its own date, and the
 * series from there on), so that date's weekday always stays selected.
 */
export function TaskRepeatPicker() {
    const { task, series, recurring, write, askScope } = useTaskEditor();
    const anchor = repeatAnchor(task);
    const current = series?.recurrence ?? null;
    const picker = useToolbarPicker('repeat');
    // A Someday task cannot repeat; a recurring one waits for its rule to
    // load.
    const disabled =
        anchor === null || (isRecurring(task) && series === undefined);
    const open = picker.open && !disabled;
    const [draft, setDraft] = useState<RepeatDraft | null>(null);

    // Every opening (a click or `r`) starts from what is stored.
    if (open && draft === null && anchor) {
        setDraft(repeatDraft(anchor, current));
    } else if (!open && draft !== null) {
        setDraft(null);
    }

    const wholeSeries = recurring && !!series && isSeriesStart(task, series);
    const asksForScope = recurring && !!series && !wholeSeries;

    const label = current
        ? `Repeat: ${summarizeRecurrence(current)}`
        : 'Repeat';

    const apply = async () => {
        picker.onOpenChange(false);

        if (!draft) {
            return;
        }

        const rule = draftToRecurrence(draft);

        if (sameRecurrence(rule, current)) {
            return;
        }

        // From the series' first occurrence a change is the whole series';
        // from a later one, ask whether only this task changes.
        const scope = asksForScope
            ? await askScope(rule === null ? 'stop-repeating' : 'repeat')
            : undefined;

        if (scope === null) {
            return;
        }

        write(
            async (id) => {
                const item = await setRecurrence(id, rule, { scope });
                // When the rule skips the task's day, follow the task to its
                // first date.
                const first =
                    item.kind === 'series' &&
                    firstRuleDate(item.recurrence, item.date);

                return first ? { id: occurrenceId(item.id, first) } : item;
            },
            { follow: true, error: 'Could not change the repeat.' },
        );
    };

    return (
        <Popover open={open} onOpenChange={picker.onOpenChange}>
            <ToolbarTooltip label={label} action="dialog.repeat">
                <PopoverTrigger asChild>
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={label}
                        disabled={disabled}
                        className={cn(
                            TOOLBAR_BUTTON_CLASS,
                            current && 'text-foreground',
                        )}
                    >
                        <Repeat className={cn(!current && 'opacity-60')} />
                    </Button>
                </PopoverTrigger>
            </ToolbarTooltip>
            {anchor && draft && (
                <PopoverContent align="end" className="w-80 gap-4">
                    <RepeatForm
                        anchor={anchor}
                        draft={draft}
                        onChange={setDraft}
                    />
                    <StartNote anchor={anchor} draft={draft} />
                    {wholeSeries && (
                        <p className="text-xs text-muted-foreground">
                            {draft.kind === 'never'
                                ? 'Stops the whole series.'
                                : 'Applies to the whole series.'}
                        </p>
                    )}
                    <Button
                        type="button"
                        // A rule that ends before its first date is refused.
                        disabled={!repeatsAtLeastOnce(draft, anchor)}
                        onClick={apply}
                    >
                        Apply
                    </Button>
                </PopoverContent>
            )}
        </Popover>
    );
}

function repeatsAtLeastOnce(draft: RepeatDraft, anchor: string): boolean {
    if (draft.kind === 'daily' && !isValidEvery(draft.every)) {
        return false;
    }

    const rule = draftToRecurrence(draft);

    return rule === null || firstRuleDate(rule, anchor) !== null;
}

/**
 * "Starts on Sun, 1 Nov 2026." when the rule skips the task's own day (a
 * monthly day other than the date's): the task moves to that first date.
 */
function StartNote({ anchor, draft }: { anchor: string; draft: RepeatDraft }) {
    const rule = draftToRecurrence(draft);
    const first = rule && firstRuleDate(rule, anchor);

    // An invalid number of days has its own message.
    if (
        !rule ||
        first === anchor ||
        (rule.type === 'daily' && !isValidEvery(rule.every))
    ) {
        return null;
    }

    return (
        <p className="text-xs text-muted-foreground">
            {first
                ? `Starts on ${formatLongDate(first)}.`
                : 'Ends before it repeats once.'}
        </p>
    );
}

function RepeatForm({
    anchor,
    draft,
    onChange,
}: {
    anchor: string;
    draft: RepeatDraft;
    onChange: (draft: RepeatDraft) => void;
}) {
    const anchorWeekday = isoWeekday(anchor);

    return (
        <>
            <ToggleGroup
                type="single"
                variant="outline"
                size="sm"
                spacing={0}
                aria-label="Repeat"
                value={draft.kind}
                onValueChange={(value) => {
                    // Radix sends '' when the current item is clicked again.
                    if (
                        value === 'never' ||
                        value === 'daily' ||
                        value === 'weekly' ||
                        value === 'monthly'
                    ) {
                        onChange({ ...draft, kind: value });
                    }
                }}
                className="w-full"
            >
                <ToggleGroupItem
                    value="never"
                    className={cn('flex-1', SELECTED_CLASS)}
                >
                    Never
                </ToggleGroupItem>
                <ToggleGroupItem
                    value="daily"
                    className={cn('flex-1', SELECTED_CLASS)}
                >
                    Daily
                </ToggleGroupItem>
                <ToggleGroupItem
                    value="weekly"
                    className={cn('flex-1', SELECTED_CLASS)}
                >
                    Weekly
                </ToggleGroupItem>
                <ToggleGroupItem
                    value="monthly"
                    className={cn('flex-1', SELECTED_CLASS)}
                >
                    Monthly
                </ToggleGroupItem>
            </ToggleGroup>

            {draft.kind === 'daily' && (
                <EveryDays
                    every={draft.every}
                    onChange={(every) => onChange({ ...draft, every })}
                />
            )}

            {draft.kind === 'weekly' && (
                <div className="flex flex-col gap-2">
                    <ToggleGroup
                        type="multiple"
                        size="sm"
                        spacing={1}
                        aria-label="Weekdays"
                        value={draft.weekdays.map(String)}
                        onValueChange={(values) => {
                            const weekdays = values.map(
                                (value) => Number(value) as IsoWeekday,
                            );

                            // The task's own weekday stays selected, or the
                            // task would vanish from its day.
                            onChange({
                                ...draft,
                                weekdays: weekdays.includes(anchorWeekday)
                                    ? weekdays
                                    : [...weekdays, anchorWeekday],
                            });
                        }}
                        className="w-full justify-between"
                    >
                        {ISO_WEEKDAYS.map((weekday) => (
                            <ToggleGroupItem
                                key={weekday}
                                value={String(weekday)}
                                aria-label={weekdayName(weekday, 'long')}
                                className={cn(
                                    'min-w-0 flex-1 px-0 text-xs',
                                    SELECTED_CLASS,
                                )}
                            >
                                {weekdayName(weekday)}
                            </ToggleGroupItem>
                        ))}
                    </ToggleGroup>
                    <p className="text-xs text-muted-foreground">
                        Always on {weekdayName(anchorWeekday, 'long')}, the
                        task's day.
                    </p>
                </div>
            )}

            {draft.kind === 'monthly' && (
                <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2 text-sm">
                        <span>Monthly on day</span>
                        <Select
                            value={String(draft.day)}
                            onValueChange={(value) =>
                                onChange({ ...draft, day: Number(value) })
                            }
                        >
                            <SelectTrigger
                                size="sm"
                                aria-label="Day of the month"
                                className="tabular-nums"
                            >
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="max-h-64">
                                {DAYS_OF_MONTH.map((day) => (
                                    <SelectItem key={day} value={String(day)}>
                                        {day}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    {draft.day > 28 && (
                        <p className="text-xs text-muted-foreground">
                            On the last day in shorter months.
                        </p>
                    )}
                </div>
            )}

            {draft.kind !== 'never' && (
                <RepeatEnd
                    anchor={anchor}
                    until={draft.until}
                    onChange={(until) => onChange({ ...draft, until })}
                />
            )}
        </>
    );
}

/**
 * "Every [N] days". The text is kept as typed, so the field can be cleared
 * while typing; anything but a whole number from 1 to 365 reaches the draft
 * as NaN, which keeps "Apply" disabled.
 */
function EveryDays({
    every,
    onChange,
}: {
    every: number;
    onChange: (every: number) => void;
}) {
    // Coming back to Daily after typing an invalid number starts empty.
    const [text, setText] = useState(Number.isNaN(every) ? '' : String(every));
    const valid = isValidEvery(every);
    const errorId = useId();

    return (
        <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2 text-sm">
                <span>Every</span>
                <Input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={MAX_EVERY_DAYS}
                    step={1}
                    aria-label="Number of days"
                    aria-invalid={!valid}
                    aria-describedby={valid ? undefined : errorId}
                    value={text}
                    onChange={(event) => {
                        const value = event.target.value;
                        const days = /^\d+$/.test(value) ? Number(value) : NaN;

                        setText(value);
                        onChange(isValidEvery(days) ? days : NaN);
                    }}
                    className="h-8 w-20 tabular-nums"
                />
                <span>{every === 1 ? 'day' : 'days'}</span>
            </div>
            {!valid && (
                <p id={errorId} className="text-xs text-destructive">
                    Enter a number of days from 1 to {MAX_EVERY_DAYS}.
                </p>
            )}
        </div>
    );
}

/** "Ends": never, or on a day picked from a calendar (not before the start). */
function RepeatEnd({
    anchor,
    until,
    onChange,
}: {
    anchor: string;
    until: string | null;
    onChange: (until: string | null) => void;
}) {
    const [open, setOpen] = useState(false);
    const selected = until ? parseDateKey(until) : undefined;
    const label = until ? formatLongDate(until) : 'Never';

    return (
        <div className="flex items-center gap-2 text-sm">
            <span>Ends</span>
            <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger asChild>
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        aria-label={`Ends: ${label}`}
                    >
                        {label}
                    </Button>
                </PopoverTrigger>
                <PopoverContent
                    align="start"
                    onOpenAutoFocus={focusCalendarDay}
                    className="w-auto p-0"
                >
                    <Calendar
                        mode="single"
                        weekStartsOn={1}
                        selected={selected}
                        defaultMonth={selected ?? parseDateKey(anchor)}
                        disabled={{ before: parseDateKey(anchor) }}
                        onSelect={(date) => {
                            setOpen(false);
                            onChange(date ? toDateKey(date) : null);
                        }}
                    />
                </PopoverContent>
            </Popover>
            {until && (
                <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Never ends"
                    onClick={() => onChange(null)}
                    className="rounded-full"
                >
                    <X />
                </Button>
            )}
        </div>
    );
}
