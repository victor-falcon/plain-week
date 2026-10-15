import type { IsoWeekday, Recurrence } from '@/lib/db/types';
import { dayOfMonth, isoWeekday } from '@/lib/recurrence/dates';
import type { PlannerTask } from '@/lib/recurrence/expand';
import { formatShortDate } from './format';

/** The UI is English only for now (see format.ts). */
const LOCALE = 'en-GB';

/** ISO weekdays in the order the picker shows them: weeks start on Monday. */
export const ISO_WEEKDAYS: IsoWeekday[] = [1, 2, 3, 4, 5, 6, 7];

/** 2026-10-12 is a Monday: ISO weekday n is 2026-10-(11 + n). */
function weekdayDate(weekday: IsoWeekday): Date {
    return new Date(Date.UTC(2026, 9, 11 + weekday));
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
