<?php

namespace App\Http\Middleware;

use App\Models\User;
use Closure;
use DateTimeZone;
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
        }

        return $next($request);
    }

    /**
     * Browsers may report legacy aliases ("Asia/Calcutta"), which PHP still knows.
     */
    private static function isKnown(string $timezone): bool
    {
        return in_array($timezone, DateTimeZone::listIdentifiers(DateTimeZone::ALL_WITH_BC), true);
    }
}
