import { describe, expect, it } from 'vitest';
import { formatTimeAgo } from './relative-time';

const now = new Date('2026-10-26T10:00:00Z');

describe('formatTimeAgo', () => {
    it.each([
        ['2026-10-26T09:59:30Z', 'just now'],
        ['2026-10-26T10:05:00Z', 'just now'],
        ['2026-10-26T09:59:00Z', '1 minute ago'],
        ['2026-10-26T09:55:00Z', '5 minutes ago'],
        ['2026-10-26T07:00:00Z', '3 hours ago'],
        ['2026-10-25T09:00:00Z', 'yesterday'],
        ['2026-10-12T10:00:00Z', '2 weeks ago'],
        ['2026-08-01T10:00:00Z', '2 months ago'],
    ])('%s reads as %s', (iso, expected) => {
        expect(formatTimeAgo(iso, now)).toBe(expected);
    });
});
