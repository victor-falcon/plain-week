import { describe, expect, it } from 'vite-plus/test';
import { completeTag, parseNewTaskInput, suggestLabels } from './smart-input';

const TODAY = '2026-11-08';

const LABELS = [
    { color: 'pink', name: 'Pink' },
    { color: 'green', name: 'Deep work' },
    { color: 'lilac', name: 'Lilac' },
] as const;

const parse = (input: string) => parseNewTaskInput(input, TODAY, LABELS);

/** The text of each recognized part, read back from the input by its range. */
function marked(input: string) {
    const { ranges, tag } = parse(input);
    const read = (range: { start: number; end: number } | null) =>
        range && input.slice(range.start, range.end);

    return {
        date: read(ranges.date),
        time: read(ranges.time),
        label: read(ranges.label),
        tag: read(tag),
    };
}

describe('parseNewTaskInput', () => {
    it('reads a date then a time', () => {
        expect(parse('31 Dec 17:30 Gym')).toMatchObject({
            text: 'Gym',
            date: '2026-12-31',
            time: '17:30',
            color: null,
        });
    });

    it('reads a time then a date', () => {
        expect(parse('17:30 31 dic Gym')).toMatchObject({
            text: 'Gym',
            date: '2026-12-31',
            time: '17:30',
        });
    });

    it('reads a date or a time alone', () => {
        expect(parse('31 Dec Gym')).toMatchObject({
            text: 'Gym',
            date: '2026-12-31',
            time: null,
        });
        expect(parse('9:05 Call')).toMatchObject({
            text: 'Call',
            date: null,
            time: '09:05',
        });
    });

    it('takes each at most once', () => {
        expect(parse('31 Dec 1 Jan Gym')).toMatchObject({
            text: '1 Jan Gym',
            date: '2026-12-31',
            time: null,
        });
        expect(parse('17:30 18:00 Gym')).toMatchObject({
            text: '18:00 Gym',
            date: null,
            time: '17:30',
        });
    });

    it('keeps the last part as text when nothing follows it', () => {
        expect(parse('31 Dec 17:30')).toMatchObject({
            text: '17:30',
            date: '2026-12-31',
            time: null,
        });
    });

    it('leaves a trailing date in the text', () => {
        expect(parse('Gym 31 Dec')).toMatchObject({
            text: 'Gym 31 Dec',
            date: null,
            time: null,
        });
    });

    it('reads nothing from plain text', () => {
        expect(parse('  Call mum ')).toEqual({
            text: 'Call mum',
            date: null,
            time: null,
            color: null,
            ranges: { date: null, time: null, label: null },
            tag: null,
        });
    });

    describe('labels', () => {
        it('takes a #label anywhere out of the text', () => {
            expect(parse('#pink Gym')).toMatchObject({
                text: 'Gym',
                color: 'pink',
            });
            expect(parse('Gym #pink with Ana')).toMatchObject({
                text: 'Gym with Ana',
                color: 'pink',
            });
            expect(parse('Gym #pink')).toMatchObject({
                text: 'Gym',
                color: 'pink',
            });
        });

        it('ignores case, spaces and hyphens', () => {
            expect(parse('Gym #PINK').color).toBe('pink');
            expect(parse('Focus #deep-work').color).toBe('green');
            expect(parse('Focus #deepwork').color).toBe('green');
        });

        it('matches a renamed label by its name and its colour id', () => {
            expect(parse('Focus #deep-work').text).toBe('Focus');
            expect(parse('Focus #green')).toMatchObject({
                text: 'Focus',
                color: 'green',
            });
        });

        it('applies only the first label; later ones stay as text', () => {
            expect(parse('#pink Gym #lilac')).toMatchObject({
                text: 'Gym #lilac',
                color: 'pink',
            });
            expect(marked('#pink Gym #lilac').label).toBe('#pink');
        });

        it('leaves an unknown #word as text and takes a later label', () => {
            expect(parse('Read #books today')).toMatchObject({
                text: 'Read #books today',
                color: null,
            });
            expect(parse('Read #books #lilac')).toMatchObject({
                text: 'Read #books',
                color: 'lilac',
            });
        });

        it('only reads a # at the start of a word', () => {
            expect(parse('Learn C#pink')).toMatchObject({
                text: 'Learn C#pink',
                color: null,
            });
        });

        it('keeps a label alone as text: a task needs a title', () => {
            expect(parse('#pink')).toMatchObject({
                text: '#pink',
                color: null,
            });
            expect(parse('17:30 #pink')).toMatchObject({
                text: '17:30',
                color: 'pink',
                time: null,
            });
        });

        it('reads the leading date and time once the label is out', () => {
            expect(parse('#pink 31 Dec 17:30 Gym')).toMatchObject({
                text: 'Gym',
                date: '2026-12-31',
                time: '17:30',
                color: 'pink',
            });
            expect(parse('31 Dec #pink Gym')).toMatchObject({
                text: 'Gym',
                date: '2026-12-31',
                color: 'pink',
            });
        });

        it('knows no label without labels', () => {
            expect(parseNewTaskInput('Gym #pink', TODAY, [])).toMatchObject({
                text: 'Gym #pink',
                color: null,
            });
        });
    });

    describe('ranges', () => {
        it('marks each recognized part in the original input', () => {
            expect(marked('31 Dec  17:30 Gym #pink now')).toEqual({
                date: '31 Dec',
                time: '17:30',
                label: '#pink',
                tag: null,
            });
            expect(marked('  17:30 5 ene. Gym')).toEqual({
                date: '5 ene.',
                time: '17:30',
                label: null,
                tag: null,
            });
        });

        it('marks the date after a leading label', () => {
            const { ranges } = parse('#pink 31 Dec Gym');

            expect(ranges.label).toEqual({ start: 0, end: 5 });
            expect(ranges.date).toEqual({ start: 6, end: 12 });
        });
    });

    describe('in-progress tag', () => {
        it('is the #word the input ends with', () => {
            expect(parse('Gym #pi').tag).toEqual({
                start: 4,
                end: 7,
                query: 'pi',
            });
            expect(parse('Gym #').tag).toEqual({ start: 4, end: 5, query: '' });
        });

        it('is gone once a space follows', () => {
            expect(parse('Gym #pi ').tag).toBeNull();
        });

        it('applies the colour once it fully matches', () => {
            expect(parse('Gym #pi').color).toBeNull();
            expect(parse('Gym #pink')).toMatchObject({
                text: 'Gym',
                color: 'pink',
                tag: { start: 4, end: 9, query: 'pink' },
                ranges: { label: { start: 4, end: 9 } },
            });
        });

        it('is not suggested once an earlier label applies', () => {
            expect(parse('#pink Gym #li').tag).toBeNull();
        });
    });
});

describe('suggestLabels', () => {
    it('suggests labels whose name, tag or colour id starts with the query', () => {
        const colors = (query: string) =>
            suggestLabels(query, LABELS).map((label) => label.color);

        expect(colors('')).toEqual(['pink', 'green', 'lilac']);
        expect(colors('p')).toEqual(['pink']);
        expect(colors('DEEP-w')).toEqual(['green']);
        expect(colors('gr')).toEqual(['green']);
        expect(colors('l')).toEqual(['lilac']);
        expect(colors('x')).toEqual([]);
    });
});

describe('completeTag', () => {
    it('replaces the partial tag with the label tag and a space', () => {
        expect(
            completeTag('Gym #de', { start: 4, end: 7 }, 'Deep work'),
        ).toEqual({ value: 'Gym #deep-work ', caret: 15 });
    });
});
