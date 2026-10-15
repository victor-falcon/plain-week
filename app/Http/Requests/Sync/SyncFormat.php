<?php

namespace App\Http\Requests\Sync;

use Illuminate\Http\Request;

/**
 * What a sync client understands, sent in the `X-Sync-Format` header on push and pull (see docs/architecture.md).
 */
final class SyncFormat
{
    public const string HEADER = 'X-Sync-Format';

    /**
     * Clients up to v0.0.3, which send no header: weekly and monthly rules only.
     */
    public const int LEGACY = 1;

    /**
     * Clients that also understand daily ("every N days") rules.
     */
    public const int DAILY_RULES = 2;

    /**
     * The format of a request; a missing or malformed header means a legacy client.
     */
    public static function of(Request $request): int
    {
        $value = $request->header(self::HEADER);

        return is_string($value) && ctype_digit($value) ? max(self::LEGACY, (int) $value) : self::LEGACY;
    }

    public static function understandsDailyRules(int $format): bool
    {
        return $format >= self::DAILY_RULES;
    }
}
