<?php

namespace App\Tasks;

use InvalidArgumentException;

/**
 * A port of npm `fractional-indexing` v4 (`generateKeyBetween`, `generateNKeysBetween`) with its default alphabets:
 * base-62 digits and A-Z/a-z heads, the keys the client writes to `position`. Keys must be byte for byte the same as
 * the client's, which `tests/fixtures/fractional-indexing.json` (written from the npm library) checks. Keys are ASCII
 * and compared with `strcmp` (never `<`: PHP compares numeric strings such as `"25"` and `"5"` as numbers), which
 * orders them like JavaScript's string comparison.
 */
final class FractionalIndex
{
    private const string DIGITS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

    private const string INT_DIGITS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

    /**
     * A key that sorts between `$a` and `$b` (null for the start or the end). Both may be given in either order.
     *
     * @throws InvalidArgumentException When a key is invalid, both are equal, or no key fits.
     */
    public static function between(?string $a, ?string $b): string
    {
        if ($a !== null) {
            self::validateOrderKey($a);
        }

        if ($b !== null) {
            self::validateOrderKey($b);
        }

        if ($a !== null && $b !== null && strcmp($a, $b) > 0) {
            [$a, $b] = [$b, $a];
        }

        if ($a === null) {
            if ($b === null) {
                return self::INT_DIGITS[intdiv(strlen(self::INT_DIGITS), 2)].self::DIGITS[0];
            }

            $ib = self::integerPart($b);
            $fb = substr($b, strlen($ib));

            if (self::isSmallestInteger($ib)) {
                return $ib.self::midpoint('', $fb);
            }

            if (strcmp($ib, $b) < 0) {
                return $ib;
            }

            return self::decrementInteger($ib) ?? throw new InvalidArgumentException('cannot decrement any more');
        }

        if ($b === null) {
            $ia = self::integerPart($a);
            $fa = substr($a, strlen($ia));

            return self::incrementInteger($ia) ?? $ia.self::midpoint($fa, null);
        }

        $ia = self::integerPart($a);
        $fa = substr($a, strlen($ia));
        $ib = self::integerPart($b);
        $fb = substr($b, strlen($ib));

        if ($ia === $ib) {
            return $ia.self::midpoint($fa, $fb);
        }

        $i = self::incrementInteger($ia) ?? throw new InvalidArgumentException('cannot increment any more');

        return strcmp($i, $b) < 0 ? $i : $ia.self::midpoint($fa, null);
    }

    /**
     * `$n` distinct keys between `$a` and `$b`, in order: consecutive integer keys when one bound is null, short keys
     * between both otherwise.
     *
     * @return list<string>
     */
    public static function nBetween(?string $a, ?string $b, int $n): array
    {
        if ($n <= 0) {
            return [];
        }

        if ($n === 1) {
            return [self::between($a, $b)];
        }

        if ($b === null) {
            $c = self::between($a, $b);
            $result = [$c];

            for ($i = 0; $i < $n - 1; $i++) {
                $c = self::between($c, $b);
                $result[] = $c;
            }

            return $result;
        }

        if ($a === null) {
            $c = self::between($a, $b);
            $result = [$c];

            for ($i = 0; $i < $n - 1; $i++) {
                $c = self::between($a, $c);
                $result[] = $c;
            }

            return array_reverse($result);
        }

        $mid = intdiv($n, 2);
        $c = self::between($a, $b);

        return [...self::nBetween($a, $c, $mid), $c, ...self::nBetween($c, $b, $n - $mid - 1)];
    }

    private static function midpoint(string $a, ?string $b): string
    {
        $zero = self::DIGITS[0];

        if ($b !== null && strcmp($a, $b) >= 0) {
            throw new InvalidArgumentException("{$a} >= {$b}");
        }

        if (str_ends_with($a, $zero) || ($b !== null && str_ends_with($b, $zero))) {
            throw new InvalidArgumentException('trailing zero');
        }

        if ($b !== null && $b !== '') {
            $n = 0;

            while ($n < strlen($b) && ($a[$n] ?? $zero) === $b[$n]) {
                $n++;
            }

            if ($n > 0) {
                return substr($b, 0, $n).self::midpoint(substr($a, $n), substr($b, $n));
            }
        }

        $digitA = $a !== '' ? self::digit($a[0]) : 0;
        $digitB = $b !== null && $b !== '' ? self::digit($b[0]) : strlen(self::DIGITS);

        if ($digitB - $digitA > 1) {
            // Math.round(0.5 * (a + b)) on non-negative integers.
            return self::DIGITS[intdiv($digitA + $digitB + 1, 2)];
        }

        if ($b !== null && strlen($b) > 1) {
            return $b[0];
        }

        return self::DIGITS[$digitA].self::midpoint(substr($a, 1), null);
    }

    private static function digit(string $char): int
    {
        $index = strpos(self::DIGITS, $char);

        return $index === false ? 0 : $index;
    }

    private static function integerLength(string $head): int
    {
        $index = strpos(self::INT_DIGITS, $head);

        if ($head === '' || $index === false) {
            throw new InvalidArgumentException("invalid order key head: {$head}");
        }

        $half = intdiv(strlen(self::INT_DIGITS), 2);

        return $index < $half ? $half - $index + 1 : $index - $half + 2;
    }

    private static function integerPart(string $key): string
    {
        $length = self::integerLength($key[0] ?? '');

        if ($length > strlen($key)) {
            throw new InvalidArgumentException("invalid order key: {$key}");
        }

        return substr($key, 0, $length);
    }

    private static function validateInteger(string $int): void
    {
        if (strlen($int) !== self::integerLength($int[0] ?? '')) {
            throw new InvalidArgumentException("invalid integer part of order key: {$int}");
        }
    }

    private static function isSmallestInteger(string $key): bool
    {
        return $key === self::INT_DIGITS[0].str_repeat(self::DIGITS[0], intdiv(strlen(self::INT_DIGITS), 2));
    }

    private static function validateOrderKey(string $key): void
    {
        if (self::isSmallestInteger($key)) {
            throw new InvalidArgumentException("invalid order key: {$key}");
        }

        $fraction = substr($key, strlen(self::integerPart($key)));

        if (str_ends_with($fraction, self::DIGITS[0])) {
            throw new InvalidArgumentException("invalid order key: {$key}");
        }
    }

    private static function incrementInteger(string $x): ?string
    {
        self::validateInteger($x);

        $head = $x[0];
        $trailing = '';

        for ($i = strlen($x) - 1; $i >= 1; $i--) {
            $d = self::digit($x[$i]) + 1;

            if ($d === strlen(self::DIGITS)) {
                $trailing = self::DIGITS[0].$trailing;
            } else {
                return $head.substr($x, 1, $i - 1).substr(self::DIGITS, $d, 1).$trailing;
            }
        }

        $headIndex = (int) strpos(self::INT_DIGITS, $head);

        if ($headIndex === strlen(self::INT_DIGITS) - 1) {
            return null;
        }

        $h = substr(self::INT_DIGITS, $headIndex + 1, 1);
        $lengthDelta = self::integerLength($h) - self::integerLength($head);

        return $h.match (true) {
            $lengthDelta > 0 => $trailing.self::DIGITS[0],
            $lengthDelta < 0 => substr($trailing, 1),
            default => $trailing,
        };
    }

    private static function decrementInteger(string $x): ?string
    {
        self::validateInteger($x);

        $head = $x[0];
        $last = self::DIGITS[strlen(self::DIGITS) - 1];
        $trailing = '';

        for ($i = strlen($x) - 1; $i >= 1; $i--) {
            $d = self::digit($x[$i]) - 1;

            if ($d === -1) {
                $trailing = $last.$trailing;
            } else {
                return $head.substr($x, 1, $i - 1).substr(self::DIGITS, $d, 1).$trailing;
            }
        }

        $headIndex = (int) strpos(self::INT_DIGITS, $head);

        if ($headIndex === 0) {
            return null;
        }

        $h = substr(self::INT_DIGITS, $headIndex - 1, 1);
        $lengthDelta = self::integerLength($h) - self::integerLength($head);

        return $h.match (true) {
            $lengthDelta > 0 => $trailing.$last,
            $lengthDelta < 0 => substr($trailing, 1),
            default => $trailing,
        };
    }
}
