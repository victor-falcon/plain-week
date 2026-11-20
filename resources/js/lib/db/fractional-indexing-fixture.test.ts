import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vite-plus/test';
import { buildFractionalIndexingFixture } from '@/test/fractional-indexing-fixture';

// The server's port of fractional-indexing (App\Tasks\FractionalIndex) is
// checked against this file by tests/Feature/Tasks/FractionalIndexTest.php.
// Regenerate it with `UPDATE_FIXTURES=1 bun run test:js && bun run check:fix`.
const FIXTURE = resolve(
    __dirname,
    '../../../../tests/fixtures/fractional-indexing.json',
);

describe('fractional-indexing fixture', () => {
    it('matches what the npm library generates', () => {
        const fixture = buildFractionalIndexingFixture();

        if (process.env.UPDATE_FIXTURES === '1') {
            writeFileSync(FIXTURE, `${JSON.stringify(fixture, null, 4)}\n`);
        }

        expect(JSON.parse(readFileSync(FIXTURE, 'utf8'))).toEqual(fixture);
    });
});
