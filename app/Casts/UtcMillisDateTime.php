<?php

namespace App\Casts;

use Carbon\CarbonImmutable;
use DateTimeInterface;
use Illuminate\Contracts\Database\Eloquent\CastsAttributes;
use Illuminate\Database\Eloquent\Model;

/**
 * Stores a timestamp in UTC with millisecond precision so client-supplied values round-trip exactly.
 *
 * @implements CastsAttributes<CarbonImmutable|null, DateTimeInterface|string|null>
 */
class UtcMillisDateTime implements CastsAttributes
{
    /**
     * The ISO-8601 format used on the wire (`2026-10-15T08:35:00.123Z`).
     */
    public const string WIRE_FORMAT = 'Y-m-d\TH:i:s.v\Z';

    private const string STORAGE_FORMAT = 'Y-m-d H:i:s.v';

    /**
     * @param  array<string, mixed>  $attributes
     */
    public function get(Model $model, string $key, mixed $value, array $attributes): ?CarbonImmutable
    {
        if ($value === null) {
            return null;
        }

        return CarbonImmutable::parse($value, 'UTC');
    }

    /**
     * @param  array<string, mixed>  $attributes
     */
    public function set(Model $model, string $key, mixed $value, array $attributes): ?string
    {
        if ($value === null) {
            return null;
        }

        $date = $value instanceof DateTimeInterface
            ? CarbonImmutable::instance($value)
            : CarbonImmutable::parse($value, 'UTC');

        return $date->utc()->format(self::STORAGE_FORMAT);
    }
}
