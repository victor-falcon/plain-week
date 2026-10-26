const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 365 * 24 * 60 * 60],
    ['month', 30 * 24 * 60 * 60],
    ['week', 7 * 24 * 60 * 60],
    ['day', 24 * 60 * 60],
    ['hour', 60 * 60],
    ['minute', 60],
];

/**
 * How long ago `iso` was, in words: "just now", "5 minutes ago",
 * "yesterday". A time in the future (clock skew) reads as "just now".
 */
export function formatTimeAgo(iso: string, now: Date = new Date()): string {
    const seconds = Math.max(
        0,
        (now.getTime() - new Date(iso).getTime()) / 1000,
    );
    const format = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

    for (const [unit, size] of UNITS) {
        if (seconds >= size) {
            return format.format(-Math.floor(seconds / size), unit);
        }
    }

    return 'just now';
}
