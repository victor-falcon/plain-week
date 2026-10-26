<?php

namespace App\Integrations\GoogleCalendar;

use App\Models\User;

/**
 * The time zone of a user's Plain Week calendar: the browser's time zone
 * stored on the account (`users.timezone`), else the app's.
 */
final class CalendarTimezone
{
    public static function for(User $user): string
    {
        $timezone = $user->getAttribute('timezone');

        return is_string($timezone) && in_array($timezone, timezone_identifiers_list(), true)
            ? $timezone
            : (string) config('app.timezone');
    }
}
