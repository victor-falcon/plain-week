import type { LabelColor } from '@/lib/db/types';
import { parseSmartDate } from './smart-date';
import { parseSmartTime } from './smart-time';
import { findLabel, labelKey, labelTag } from './task-labels';
import type { TaskLabelView } from './task-labels';

/** A part of the original input: `start` inclusive, `end` exclusive. */
export type SmartRange = { start: number; end: number };

/** The `#word` still being typed at the end of the input (no space after it). */
export type InProgressTag = SmartRange & {
    /** The text after `#` (may be empty). */
    query: string;
};

export type ParsedNewTask = {
    text: string;
    /** 'YYYY-MM-DD', or null when the text does not start with a date. */
    date: string | null;
    /** 'HH:mm', or null when the text does not start with a time. */
    time: string | null;
    /** The colour of the first `#label` that names one, or null. */
    color: LabelColor | null;
    /** Where each recognized part sits in the original input. */
    ranges: {
        date: SmartRange | null;
        time: SmartRange | null;
        label: SmartRange | null;
    };
    /** The tag being typed, for the autocomplete; null once a label applies elsewhere. */
    tag: InProgressTag | null;
};

type MatchableLabel = Pick<TaskLabelView, 'color' | 'name'>;

/** A `#` at the start or after whitespace, then everything up to the next whitespace. */
const TAG = /(?<=^|\s)#(\S*)/gu;

/** Text with, for each character, its offset in the original input. */
type Tracked = { text: string; origin: number[] };

function track(input: string): Tracked {
    return {
        text: input,
        origin: Array.from({ length: input.length }, (_, index) => index),
    };
}

function cut(tracked: Tracked, start: number, end: number): Tracked {
    return {
        text: tracked.text.slice(0, start) + tracked.text.slice(end),
        origin: [
            ...tracked.origin.slice(0, start),
            ...tracked.origin.slice(end),
        ],
    };
}

function trim(tracked: Tracked): Tracked {
    const start = tracked.text.length - tracked.text.trimStart().length;
    const end = tracked.text.trimEnd().length;

    if (end <= start) {
        return { text: '', origin: [] };
    }

    return {
        text: tracked.text.slice(start, end),
        origin: tracked.origin.slice(start, end),
    };
}

/**
 * Takes the part a leading parser consumed (`rest` is what it left) off the
 * front of `tracked`, returning its range in the original input.
 */
function takeLeading(
    tracked: Tracked,
    rest: string,
): { tracked: Tracked; range: SmartRange } {
    const consumed = tracked.text.length - rest.length;
    const length = tracked.text.slice(0, consumed).trimEnd().length;

    return {
        tracked: trim(cut(tracked, 0, consumed)),
        range: {
            start: tracked.origin[0],
            end: tracked.origin[length - 1] + 1,
        },
    };
}

/** Removes `start..end` and the spaces on one side, so words stay one space apart. */
function removeWord(tracked: Tracked, start: number, end: number): Tracked {
    const { text } = tracked;
    let after = end;

    while (after < text.length && /\s/u.test(text[after])) {
        after++;
    }

    if (after < text.length) {
        return cut(tracked, start, after);
    }

    let before = start;

    while (before > 0 && /\s/u.test(text[before - 1])) {
        before--;
    }

    return cut(tracked, before, end);
}

/**
 * Reads what a new-task row was given:
 *
 * - The first `#word` anywhere that names a label (`findLabel`: its colour id
 *   or its name, ignoring case, spaces and hyphens) sets the colour and is
 *   taken out of the text. Later tags, and `#words` naming no label, stay as
 *   text. A tag alone stays too: a task needs a title.
 * - Then a leading date and a leading time, in either order ("31 Dec 17:30
 *   Gym", "17:30 31 Dec Gym"), are taken out of the text. See
 *   `parseSmartDate` and `parseSmartTime`; `today` is 'YYYY-MM-DD'.
 *
 * `ranges` say where each recognized part is in `input`, and `tag` is the
 * `#word` the input ends with (no space after it yet), for the autocomplete.
 */
export function parseNewTaskInput(
    input: string,
    today: string,
    labels: readonly MatchableLabel[],
): ParsedNewTask {
    let tracked = track(input);
    let color: LabelColor | null = null;
    let labelRange: SmartRange | null = null;
    let tag: InProgressTag | null = null;

    for (const match of input.matchAll(TAG)) {
        const start = match.index;
        const end = start + match[0].length;

        if (end === input.length) {
            tag = { start, end, query: match[1] };
        }

        if (color !== null) {
            continue;
        }

        const label = findLabel(match[1], labels);
        const remaining = label && trim(removeWord(tracked, start, end));

        if (label && remaining && remaining.text !== '') {
            color = label.color;
            labelRange = { start, end };
            tracked = remaining;
        }
    }

    // Once a label applies, a later tag would stay as text: nothing to suggest.
    if (tag !== null && labelRange !== null && tag.start !== labelRange.start) {
        tag = null;
    }

    tracked = trim(tracked);

    let date: string | null = null;
    let time: string | null = null;
    let dateRange: SmartRange | null = null;
    let timeRange: SmartRange | null = null;

    // Two passes, so either may come first; each is taken at most once.
    for (let pass = 0; pass < 2; pass++) {
        if (date === null) {
            const parsed = parseSmartDate(tracked.text, today);

            if (parsed.date !== null) {
                date = parsed.date;
                ({ tracked, range: dateRange } = takeLeading(
                    tracked,
                    parsed.text,
                ));
            }
        }

        if (time === null) {
            const parsed = parseSmartTime(tracked.text);

            if (parsed.time !== null) {
                time = parsed.time;
                ({ tracked, range: timeRange } = takeLeading(
                    tracked,
                    parsed.text,
                ));
            }
        }
    }

    return {
        text: tracked.text,
        date,
        time,
        color,
        ranges: { date: dateRange, time: timeRange, label: labelRange },
        tag,
    };
}

/**
 * The labels to suggest for an in-progress tag: those whose name (so its
 * tag) or colour id starts with `query`, ignoring case, spaces and hyphens,
 * in picker order. An empty query suggests every label.
 */
export function suggestLabels<T extends MatchableLabel>(
    query: string,
    labels: readonly T[],
): T[] {
    const key = labelKey(query);

    return labels.filter(
        (label) =>
            labelKey(label.name).startsWith(key) || label.color.startsWith(key),
    );
}

/**
 * The input with the in-progress `tag` replaced by the label's `#tag` and a
 * space, and where the caret goes after it.
 */
export function completeTag(
    input: string,
    tag: SmartRange,
    name: string,
): { value: string; caret: number } {
    const inserted = `#${labelTag(name)} `;

    return {
        value: input.slice(0, tag.start) + inserted + input.slice(tag.end),
        caret: tag.start + inserted.length,
    };
}
