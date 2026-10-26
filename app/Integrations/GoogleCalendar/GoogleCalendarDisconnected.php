<?php

namespace App\Integrations\GoogleCalendar;

use RuntimeException;

/**
 * Google refused the refresh token (`invalid_grant`): access was revoked or
 * expired. The connection is marked broken and the user has to reconnect.
 */
class GoogleCalendarDisconnected extends RuntimeException
{
    /** Google's error code for a refused grant, also stored as the connection's `disconnected_reason`. */
    public const string INVALID_GRANT = 'invalid_grant';
}
