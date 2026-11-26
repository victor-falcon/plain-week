<?php

use App\Integrations\IcsFeed\IcsWriter;
use Carbon\CarbonImmutable;

test('TEXT values escape backslashes, semicolons, commas and line breaks', function () {
    expect(IcsWriter::escapeText("a\\b;c,d\ne\r\nf\rg"))->toBe('a\\\\b\;c\,d\ne\nf\ng');
});

test('TEXT values drop control characters but keep tabs', function () {
    expect(IcsWriter::escapeText("a\x00b\x07c\td\x7F"))->toBe("abc\td");
});

test('short lines are not folded', function () {
    $line = 'SUMMARY:'.str_repeat('x', 67);

    expect(strlen($line))->toBe(75)
        ->and(IcsWriter::fold($line))->toBe($line);
});

test('long lines fold at 75 octets with a leading space on continuations', function () {
    $folded = IcsWriter::fold('DESCRIPTION:'.str_repeat('x', 200));
    $lines = explode("\r\n", $folded);

    expect(strlen($lines[0]))->toBe(75);
    foreach (array_slice($lines, 1) as $line) {
        expect($line)->toStartWith(' ')
            ->and(strlen($line))->toBeLessThanOrEqual(75);
    }
    // Unfolding (removing CRLF + space) gives the line back.
    expect(str_replace("\r\n ", '', $folded))->toBe('DESCRIPTION:'.str_repeat('x', 200));
});

test('folding never splits a multi-byte character', function () {
    $line = 'SUMMARY:🎯 '.str_repeat('ñé🎯', 40);
    $folded = IcsWriter::fold($line);

    foreach (explode("\r\n", $folded) as $part) {
        expect(mb_check_encoding($part, 'UTF-8'))->toBeTrue()
            ->and(strlen($part))->toBeLessThanOrEqual(75);
    }
    expect(str_replace("\r\n ", '', $folded))->toBe($line);
});

test('the document uses CRLF line endings, ending with one', function () {
    $ics = (new IcsWriter)->begin('VCALENDAR')->text('X-WR-CALNAME', 'Plain, Week')->end('VCALENDAR')->toString();

    expect($ics)->toBe("BEGIN:VCALENDAR\r\nX-WR-CALNAME:Plain\\, Week\r\nEND:VCALENDAR\r\n");
});

test('dates and UTC times are formatted as RFC 5545 values', function () {
    $ics = (new IcsWriter)
        ->date('DTSTART', '2026-10-27')
        ->utc('DTSTAMP', CarbonImmutable::parse('2026-10-25 09:30:00', 'Europe/Madrid'))
        ->toString();

    expect($ics)->toBe("DTSTART;VALUE=DATE:20261027\r\nDTSTAMP:20261025T083000Z\r\n");
});
