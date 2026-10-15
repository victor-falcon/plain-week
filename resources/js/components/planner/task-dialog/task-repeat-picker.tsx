import { Repeat, X } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
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
import type { IsoWeekday } from '@/lib/db/types';
import { formatLongDate } from '@/lib/planner/format';
import {
    ISO_WEEKDAYS,
    draftToRecurrence,
    repeatAnchor,
    repeatDraft,
    sameRecurrence,
    startsSeries,
    summarizeRecurrence,
    weekdayName,
} from '@/lib/planner/repeat';
import type { RepeatDraft } from '@/lib/planner/repeat';
import { isoWeekday } from '@/lib/recurrence/dates';
import {
    firstRuleDate,
    isRecurring,
    occurrenceId,
} from '@/lib/recurrence/expand';
import { cn } from '@/lib/utils';
import { useTaskEditor } from './task-editor';
import { TOOLBAR_BUTTON_CLASS, ToolbarTooltip } from './toolbar-tooltip';

const DAYS_OF_MONTH = Array.from({ length: 31 }, (_, i) => i + 1);

/** A selected toggle is filled, like the toolbar's open trigger. */
const SELECTED_CLASS =
    'data-[state=on]:bg-foreground data-[state=on]:text-background';

/**
 * The Repeat toolbar button. Its popover picks "Never", "Weekly" on some
 * weekdays or "Monthly" on a day, and an optional end date; "Apply" writes it.
 * A new rule starts on the task's date (an occurrence: its own date, and the
 * series from there on), so that date's weekday always stays selected.
 */
export function TaskRepeatPicker() {
    const { task, series, recurring, write, askScope } = useTaskEditor();
    const anchor = repeatAnchor(task);
    const current = series?.recurrence ?? null;
    const [open, setOpen] = useState(false);
    const [draft, setDraft] = useState<RepeatDraft | null>(null);
    const wholeSeries = recurring && !!series && startsSeries(task, series);
    const asksForScope = recurring && !wholeSeries;

    const label = current
        ? `Repeat: ${summarizeRecurrence(current)}`
        : 'Repeat';

    const handleOpenChange = (next: boolean) => {
        setOpen(next);
        // Every opening starts from what is stored.
        setDraft(next && anchor ? repeatDraft(anchor, current) : null);
    };

    const apply = async () => {
        handleOpenChange(false);

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
        <Popover open={open} onOpenChange={handleOpenChange}>
            <ToolbarTooltip label={label}>
                <PopoverTrigger asChild>
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={label}
                        // A Someday task cannot repeat; a recurring one waits
                        // for its rule to load.
                        disabled={
                            anchor === null ||
                            (isRecurring(task) && series === undefined)
                        }
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
                            Applies to the whole series.
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

    if (!rule || first === anchor) {
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
                <PopoverContent align="start" className="w-auto p-0">
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
