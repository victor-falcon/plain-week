import { CalendarIcon, ClockIcon } from 'lucide-react';
import type { ReactNode, Ref } from 'react';
import { Badge } from '@/components/ui/badge';
import {
    Command,
    CommandEmpty,
    CommandItem,
    CommandList,
} from '@/components/ui/command';
import type { LabelColor } from '@/lib/db/types';
import { formatShortDate, formatWeekday } from '@/lib/planner/format';
import type { ParsedNewTask, SmartRange } from '@/lib/planner/smart-input';
import { TASK_COLOR_STYLES } from '@/lib/planner/task-colors';
import { defaultLabelName } from '@/lib/planner/task-labels';
import type { TaskLabelView } from '@/lib/planner/task-labels';
import { t } from '@/lib/i18n';
import { cn } from '@/lib/utils';

/** Underline colors of an in-progress tag that names a label (literal for Tailwind). */
const TAG_UNDERLINE: Record<LabelColor, string> = {
    pink: 'decoration-task-pink',
    yellow: 'decoration-task-yellow',
    black: 'decoration-task-black',
    grey: 'decoration-task-grey',
    cornflower: 'decoration-task-cornflower',
    mango: 'decoration-task-mango',
    green: 'decoration-task-green',
    lilac: 'decoration-task-lilac',
};

/** Date and time marks: a soft tint, no padding so the text never shifts. */
const MOMENT_MARK = 'rounded-sm bg-primary/10 text-primary';

type Mark = SmartRange & { className: string };

function marksOf(parsed: ParsedNewTask): Mark[] {
    const { ranges, tag, color } = parsed;
    const marks: Mark[] = [];

    if (ranges.date) {
        marks.push({ ...ranges.date, className: MOMENT_MARK });
    }

    if (ranges.time) {
        marks.push({ ...ranges.time, className: MOMENT_MARK });
    }

    // The tag still being typed is underlined, even when it already applies.
    if (tag) {
        const matches = ranges.label?.start === tag.start && color !== null;
        marks.push({
            ...tag,
            className: cn(
                'underline decoration-2 underline-offset-4',
                matches
                    ? TAG_UNDERLINE[color]
                    : 'decoration-muted-foreground decoration-dotted',
            ),
        });
    }

    if (ranges.label && color && ranges.label.start !== tag?.start) {
        marks.push({
            ...ranges.label,
            className: cn('rounded-sm', TASK_COLOR_STYLES[color].pill),
        });
    }

    return marks.sort((a, b) => a.start - b.start);
}

type MirrorProps = {
    ref: Ref<HTMLSpanElement>;
    value: string;
    parsed: ParsedNewTask;
    className: string;
};

/**
 * The input's text drawn again behind it (the input's own text is
 * transparent), so recognized parts are marked in place. It must use the
 * input's font and padding; the parent keeps it scrolled with the input.
 */
export function SmartTitleMirror({
    ref,
    value,
    parsed,
    className,
}: MirrorProps) {
    const parts: ReactNode[] = [];
    let at = 0;

    marksOf(parsed).forEach((mark) => {
        parts.push(value.slice(at, mark.start));
        parts.push(
            <mark
                key={mark.start}
                className={cn('bg-transparent text-inherit', mark.className)}
            >
                {value.slice(mark.start, mark.end)}
            </mark>,
        );
        at = mark.end;
    });
    parts.push(value.slice(at));

    return (
        <div
            aria-hidden
            data-smart-mirror
            className={cn(
                'pointer-events-none absolute inset-0 flex items-center overflow-hidden whitespace-pre',
                className,
            )}
        >
            <span ref={ref} className="will-change-transform">
                {parts}
            </span>
        </div>
    );
}

function Swatch({ color }: { color: LabelColor }) {
    return (
        <span
            aria-hidden
            className={cn(
                'size-2.5 shrink-0 rounded-full',
                TASK_COLOR_STYLES[color].swatch,
            )}
        />
    );
}

const CHIP = 'h-6 gap-1.5 bg-background shadow-sm';

type ChipsProps = {
    id: string;
    parsed: ParsedNewTask;
    labels: readonly TaskLabelView[];
    /** Show the hint when nothing is recognized. */
    showHint: boolean;
};

/**
 * What the row will create, under it: the recognized date, time and label,
 * or a hint while the row is empty.
 */
export function SmartTitleChips({ id, parsed, labels, showHint }: ChipsProps) {
    const { date, time, color } = parsed;
    const label = color && labels.find((item) => item.color === color);

    if (!date && !time && !label) {
        return showHint ? (
            <p
                id={id}
                data-smart-hint
                className="pointer-events-none absolute start-2 top-full z-20 mt-1 rounded-sm bg-background/90 px-1.5 py-0.5 text-xs text-muted-foreground"
            >
                {t('planner.smartTitleHint')}
            </p>
        ) : null;
    }

    return (
        <ul
            id={id}
            data-smart-chips
            aria-label={t('planner.smartTitleChips')}
            className="pointer-events-none absolute start-2 top-full z-20 mt-1 flex max-w-[calc(100%-1rem)] flex-wrap gap-1"
        >
            {date && (
                <li>
                    <Badge variant="outline" className={CHIP}>
                        <CalendarIcon data-icon="inline-start" />
                        {t('planner.dayLabel', {
                            weekday: formatWeekday(date),
                            day: formatShortDate(date),
                        })}
                    </Badge>
                </li>
            )}
            {time && (
                <li>
                    <Badge variant="outline" className={CHIP}>
                        <ClockIcon data-icon="inline-start" />
                        {time}
                    </Badge>
                </li>
            )}
            {label && (
                <li>
                    <Badge variant="outline" className={CHIP}>
                        <Swatch color={label.color} />
                        {label.name}
                    </Badge>
                </li>
            )}
        </ul>
    );
}

type SuggestionsProps = {
    ref: Ref<HTMLDivElement>;
    query: string;
    suggestions: readonly TaskLabelView[];
    /** The colour of the highlighted suggestion. */
    active: LabelColor | undefined;
    onActiveChange: (color: LabelColor) => void;
    onPick: (label: TaskLabelView) => void;
};

/**
 * The labels an in-progress `#tag` can become. Keys stay in the title input
 * (it owns ↑ ↓ Enter Tab Esc); this only shows them and takes pointer picks.
 */
export function LabelSuggestions({
    ref,
    query,
    suggestions,
    active,
    onActiveChange,
    onPick,
}: SuggestionsProps) {
    return (
        <Command
            shouldFilter={false}
            value={active ?? ''}
            onValueChange={(value) => onActiveChange(value as LabelColor)}
            className="rounded-2xl"
        >
            <CommandList ref={ref} label={t('planner.labelSuggestions')}>
                <CommandEmpty className="px-3 py-2 text-start text-muted-foreground">
                    {t('planner.noLabelMatch', { query })}
                </CommandEmpty>
                {suggestions.map((label) => (
                    <CommandItem
                        key={label.color}
                        value={label.color}
                        onSelect={() => onPick(label)}
                    >
                        <Swatch color={label.color} />
                        <span className="truncate">{label.name}</span>
                        {label.isCustom && (
                            <span className="ms-auto text-xs font-normal text-muted-foreground">
                                {defaultLabelName(label.color)}
                            </span>
                        )}
                    </CommandItem>
                ))}
            </CommandList>
        </Command>
    );
}
