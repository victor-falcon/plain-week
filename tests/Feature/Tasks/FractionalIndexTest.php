<?php

use App\Tasks\FractionalIndex;

// tests/fixtures/fractional-indexing.json is written from npm `fractional-indexing` by
// resources/js/lib/db/fractional-indexing-fixture.test.ts, which also fails when it drifts from the library.

/**
 * @return array<string, mixed>
 */
function fractionalIndexingFixture(): array
{
    return json_decode((string) file_get_contents(base_path('tests/fixtures/fractional-indexing.json')), true, flags: JSON_THROW_ON_ERROR);
}

it('generates the key the npm library generates between two keys', function () {
    $cases = fractionalIndexingFixture()['between'];

    expect($cases)->not->toBeEmpty();

    foreach ($cases as $case) {
        $label = json_encode([$case['a'], $case['b']]);

        if (isset($case['error'])) {
            expect(fn () => FractionalIndex::between($case['a'], $case['b']))
                ->toThrow(InvalidArgumentException::class, null, "between{$label} should fail");
        } else {
            expect(FractionalIndex::between($case['a'], $case['b']))->toBe($case['key'], "between{$label}");
        }
    }
});

it('generates the same n keys between two keys', function () {
    foreach (fractionalIndexingFixture()['nBetween'] as $case) {
        expect(FractionalIndex::nBetween($case['a'], $case['b'], $case['n']))
            ->toBe($case['keys'], json_encode([$case['a'], $case['b'], $case['n']]));
    }
});

it('generates the same keys over long append and prepend chains', function () {
    foreach (fractionalIndexingFixture()['chains'] as $chain) {
        $key = null;
        $sampled = [];

        for ($i = 1; $i <= $chain['length']; $i++) {
            $key = $chain['direction'] === 'append' ? FractionalIndex::between($key, null) : FractionalIndex::between(null, $key);

            if ($i % $chain['every'] === 0) {
                $sampled[] = $key;
            }
        }

        expect($sampled)->toBe($chain['keys'], $chain['direction']);
    }
});
