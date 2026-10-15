import type { IsoWeekday, Recurrence } from '@/lib/db/types';
import { addDays, dayOfMonth, isoWeekday } from '@/lib/recurrence/dates';
import { matchesRule } from '@/lib/recurrence/expand';
import type { PlannerTask, SeriesItem } from '@/lib/recurrence/expand';
import { LOCALE, formatShortDate } from './format';

/** ISO weekdays in the order the picker shows them: weeks start on Monday. */
export const ISO_WEEKDAYS: IsoWeekday[] = [1, 2, 3, 4, 5, 6, 7];

/** Any Monday (UTC): ISO weekday n is n - 1 days after it. */
const A_MONDAY_MS = Date.UTC(2026, 9, 12);
const DAY_MS = 86_400_000;

function weekdayDate(weekday: IsoWeekday): Date {
    return new Date(A_MONDAY_MS + (weekday - 1) * DAY_MS);
}

const shortWeekday = new Intl.DateTimeFormat(LOCALE, {
    weekday: 'short',
    timeZone: 'UTC',
});
const longWeekday = new Intl.DateTimeFormat(LOCALE, {
    weekday: 'long',
    timeZone: 'UTC',
});

/** "Mon" (or "Monday" with `long`). */
export function weekdayName(
    weekday: IsoWeekday,
    style: 'short' | 'long' = 'short',
): string {
    return (style === 'long' ? longWeekday : shortWeekday).format(
        weekdayDate(weekday),
    );
}

/**
 * The date a new rule starts from: for an occurrence or exception, the date
 * it was generated for (a new rule splits its series there); for anything
 * else, its own date. `null` for a Someday task, which cannot repeat.
 */
export function repeatAnchor(item: PlannerTask): string | null {
    return item.kind === 'occurrence' || item.kind === 'exception'
        ? item.occurrenceDate
        : item.date;
}

/**
 * Whether a change to this item can apply to "only this task" or "this and
 * all future": an occurrence, or an exception whose series still exists
 * (`series` is the item's loaded series; `undefined` while loading). A plain
 * task, a series row and an exception whose series is gone have no scope.
 */
export function asksScope(
    item: PlannerTask,
    series: SeriesItem | null | undefined,
): boolean {
    return (
        item.kind === 'occurrence' ||
        (item.kind === 'exception' && series !== null)
    );
}

/**
 * A React key that survives an occurrence's first change, when it becomes an
 * exception row with a new id (focus and row state stay put).
 */
export function rowKey(item: PlannerTask): string {
    return item.kind === 'occurrence' || item.kind === 'exception'
        ? `${item.seriesId}:${item.occurrenceDate}`
        : item.id;
}

/**
 * The first date from `anchor` on that `rule` produces, or `null` when it
 * ends before one (every rule matches within two months).
 */
export function firstRuleDate(rule: Recurrence, anchor: string): string | null {
    for (let day = anchor, i = 0; i < 62; day = addDays(day, 1), i++) {
        if (rule.until && day > rule.until) {
            return null;
        }

        if (matchesRule(rule, day)) {
            return day;
        }
    }

    return null;
}

/** What the repeat picker edits; `kind: 'never'` means no rule. */
export type RepeatDraft = {
    kind: 'never' | 'weekly' | 'monthly';
    weekdays: IsoWeekday[];
    day: number;
    until: string | null;
};

/**
 * The picker's starting state: the current rule, or, for a task that does not
 * repeat yet, "Never" with the anchor's weekday and day of the month ready, so
 * the task never disappears from its own day.
 */
export function repeatDraft(
    anchor: string,
    current: Recurrence | null,
): RepeatDraft {
    const draft: RepeatDraft = {
        kind: 'never',
        weekdays: [isoWeekday(anchor)],
        day: dayOfMonth(anchor),
        until: current?.until ?? null,
    };

    if (current?.type === 'weekly') {
        return { ...draft, kind: 'weekly', weekdays: current.weekdays };
    }

    if (current?.type === 'monthly') {
        return { ...draft, kind: 'monthly', day: current.day };
    }

    return draft;
}

/** The rule a draft stands for (`null`: no repeat). */
export function draftToRecurrence(draft: RepeatDraft): Recurrence | null {
    const end = draft.until === null ? {} : { until: draft.until };

    if (draft.kind === 'weekly') {
        return {
            type: 'weekly',
            weekdays: [...draft.weekdays].sort((a, b) => a - b),
            ...end,
        };
    }

    if (draft.kind === 'monthly') {
        return { type: 'monthly', day: draft.day, ...end };
    }

    return null;
}

/** Whether two rules repeat the same way (weekday order ignored). */
export function sameRecurrence(
    a: Recurrence | null,
    b: Recurrence | null,
): boolean {
    if (a === null || b === null) {
        return a === b;
    }

    if ((a.until ?? null) !== (b.until ?? null)) {
        return false;
    }

    if (a.type === 'weekly' && b.type === 'weekly') {
        const sorted = (days: IsoWeekday[]) =>
            [...new Set(days)].sort((x, y) => x - y).join();

        return sorted(a.weekdays) === sorted(b.weekdays);
    }

    return a.type === 'monthly' && b.type === 'monthly' && a.day === b.day;
}

/**
 * A short human summary: "Every Mon, Wed", "Every day", "Monthly on day 31",
 * plus ", until 31 Dec" when the rule ends.
 */
export function summarizeRecurrence(
    recurrence: Recurrence,
    today = new Date(),
): string {
    let summary: string;

    if (recurrence.type === 'monthly') {
        summary = `Monthly on day ${recurrence.day}`;
    } else if (recurrence.weekdays.length === 7) {
        summary = 'Every day';
    } else {
        const days = ISO_WEEKDAYS.filter((day) =>
            recurrence.weekdays.includes(day),
        );
        summary = `Every ${days.map((day) => weekdayName(day)).join(', ')}`;
    }

    return recurrence.until
        ? `${summary}, until ${formatShortDate(recurrence.until, today)}`
        : summary;
}
