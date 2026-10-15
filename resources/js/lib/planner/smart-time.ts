export type ParsedTaskInput = {
    text: string;
    /** 'HH:mm', or null when the text does not start with a time. */
    time: string | null;
};

const LEADING_TIME = /^(\d{1,2}):(\d{2})\s+(\S.*)$/su;

/**
 * Smart time recognition: a leading 24-hour time ("17:30 Gym", "9:05 Call")
 * becomes the task time and is removed from the text. A time alone, or an
 * invalid one ("25:00 Gym"), is left in the text.
 */
export function parseSmartTime(input: string): ParsedTaskInput {
    const text = input.trim();
    const match = LEADING_TIME.exec(text);

    if (match === null) {
        return { text, time: null };
    }

    const [, hours, minutes, rest] = match;

    if (Number(hours) > 23 || Number(minutes) > 59) {
        return { text, time: null };
    }

    return { text: rest.trim(), time: `${hours.padStart(2, '0')}:${minutes}` };
}
