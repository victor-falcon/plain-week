<?php

namespace App\Actions\Sync;

use Illuminate\Http\Request;

/**
 * What a sync client understands, sent in the `X-Sync-Format` header on push and pull (see docs/architecture.md).
 */
enum SyncFormat: int
{
    public const string HEADER = 'X-Sync-Format';

    /**
     * Clients up to v0.0.3, which send no header: weekly and monthly rules only.
     */
    case Legacy = 1;

    /**
     * Clients that also understand daily ("every N days") rules.
     */
    case DailyRules = 2;

    /**
     * The format of a request: a missing or malformed header means a legacy client, a higher one the newest known.
     */
    public static function fromRequest(Request $request): self
    {
        $value = $request->header(self::HEADER);

        if (! is_string($value) || ! ctype_digit($value)) {
            return self::Legacy;
        }

        return self::tryFrom((int) $value) ?? ((int) $value > self::DailyRules->value ? self::DailyRules : self::Legacy);
    }

    public function understandsDailyRules(): bool
    {
        return $this->value >= self::DailyRules->value;
    }
}
