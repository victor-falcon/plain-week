import { generateKeyBetween, generateNKeysBetween } from 'fractional-indexing';

/**
 * Inputs and outputs of npm `fractional-indexing`, written to
 * `tests/fixtures/fractional-indexing.json` so the server's port
 * (`App\Tasks\FractionalIndex`) can prove it produces the same keys.
 */

type Bound = string | null;

export type FractionalIndexingFixture = {
    between: Array<{ a: Bound; b: Bound; key?: string; error?: true }>;
    nBetween: Array<{ a: Bound; b: Bound; n: number; keys: string[] }>;
    chains: Array<{
        direction: 'append' | 'prepend';
        length: number;
        every: number;
        keys: string[];
    }>;
};

/** A small deterministic PRNG (mulberry32), so the fixture never changes. */
function random(seed: number): () => number {
    let state = seed;

    return () => {
        state = (state + 0x6d2b79f5) | 0;
        let t = Math.imul(state ^ (state >>> 15), 1 | state);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;

        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function between(a: Bound, b: Bound): FractionalIndexingFixture['between'][0] {
    try {
        return { a, b, key: generateKeyBetween(a, b) };
    } catch {
        return { a, b, error: true };
    }
}

const EDGE_CASES: Array<[Bound, Bound]> = [
    [null, null],
    ['a0', null],
    [null, 'a0'],
    ['a0', 'a1'],
    ['a1', 'a0'],
    ['a0', 'a0V'],
    ['a0V', 'a1'],
    ['az', null],
    ['azz', null],
    ['Zz', null],
    [null, 'Zz'],
    ['Zz', 'a0'],
    ['b00', null],
    [null, 'b00'],
    ['a0', 'b00'],
    ['zzzzzzzzzzzzzzzzzzzzzzzzzzz', null],
    [null, 'A00000000000000000000000001'],
    ['A00000000000000000000000001', 'A00000000000000000000000002'],
    ['a0', 'a0'],
    ['a00', null],
    ['a0', 'a10'],
    ['A00000000000000000000000000', null],
    ['', null],
    ['0', null],
    ['a', null],
    ['b0', null],
    ['a1V', 'a1W'],
    ['a1Vzzz', 'a1W'],
    // Digit-only fractions that compare differently as numbers and as
    // strings (PHP compares numeric strings as numbers).
    ['a125', 'a15'],
    ['a15', 'a125'],
    ['a19', 'a2'],
    ['a01', 'a1'],
    ['a1', 'a01'],
    ['a09', 'a1'],
    ['a0125', 'a05'],
];

export function buildFractionalIndexingFixture(): FractionalIndexingFixture {
    const next = random(20261120);
    const cases = EDGE_CASES.map(([a, b]) => between(a, b));
    let keys: string[] = [];

    // Random inserts into one growing list, as a planner does.
    for (let i = 0; i < 400; i++) {
        const gap = Math.floor(next() * (keys.length + 1));
        const a = keys[gap - 1] ?? null;
        const b = keys[gap] ?? null;
        const entry = between(a, b);

        cases.push(entry);
        keys = [...keys.slice(0, gap), entry.key as string, ...keys.slice(gap)];
    }

    const nBetween: FractionalIndexingFixture['nBetween'] = [];
    const bounds: Array<[Bound, Bound]> = [
        [null, null],
        ['a0', null],
        [null, 'a0'],
        ['a0', 'a1'],
        ['Zz', 'b00'],
        ['a0V', 'a0W'],
    ];

    bounds.forEach(([a, b]) => {
        [0, 1, 2, 3, 7, 50].forEach((n) => {
            nBetween.push({ a, b, n, keys: generateNKeysBetween(a, b, n) });
        });
    });

    const chains: FractionalIndexingFixture['chains'] = [];

    (['append', 'prepend'] as const).forEach((direction) => {
        const length = 6000;
        const every = 150;
        const sampled: string[] = [];
        let key: Bound = null;

        for (let i = 1; i <= length; i++) {
            key =
                direction === 'append'
                    ? generateKeyBetween(key, null)
                    : generateKeyBetween(null, key);

            if (i % every === 0) {
                sampled.push(key);
            }
        }

        chains.push({ direction, length, every, keys: sampled });
    });

    return { between: cases, nBetween, chains };
}
