<?php

namespace App\Http\Middleware;

use App\Jobs\SyncGoogleCalendar;
use App\Models\User;
use Closure;
use DateTimeZone;
use Exception;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Stores the time zone the browser reports in the `X-Timezone` header of the
 * sync requests on the signed-in user, so background work (scheduled
 * notifications, calendar events) runs in the user's local time. Only a known
 * IANA name that differs from the stored one is written; anything else is
 * ignored and never fails the request.
 */
class RememberTimezone
{
    public const string HEADER = 'X-Timezone';

    /**
     * @param  Closure(Request): Response  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();
        $timezone = $request->header(self::HEADER);

        if ($user instanceof User && is_string($timezone) && $timezone !== $user->timezone && self::isKnown($timezone)) {
            $user->forceFill(['timezone' => $timezone])->save();

            // Timed calendar events are placed in the user's time zone.
            SyncGoogleCalendar::dispatchFor($user, SyncGoogleCalendar::DEBOUNCE_SECONDS);
        }

        return $next($request);
    }

    /**
     * Accepts any IANA-style name PHP can build a zone from, including legacy
     * aliases browsers still report ("Asia/Calcutta") that newer tzdata no
     * longer lists. UTC offsets ("+02:00") and abbreviations ("PST") are
     * rejected: only a named zone (type 3) follows daylight saving rules.
     */
    private static function isKnown(string $timezone): bool
    {
        try {
            return (new DateTimeZone($timezone))->__serialize()['timezone_type'] === 3;
        } catch (Exception) {
            return false;
        }
    }
}
