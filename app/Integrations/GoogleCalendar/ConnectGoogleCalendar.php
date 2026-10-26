<?php

namespace App\Integrations\GoogleCalendar;

use App\Models\GoogleCalendarConnection;
use App\Models\User;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\RequestException;

/**
 * Stores the tokens from a finished OAuth flow and makes sure the account has
 * its "Plain Week" calendar: a reconnect keeps the one it already had when it
 * still exists, otherwise a new one is created.
 */
class ConnectGoogleCalendar
{
    public const string CALENDAR_NAME = 'Plain Week';

    public function __construct(private readonly GoogleCalendarClient $client) {}

    /**
     * @throws GoogleCalendarDisconnected|RequestException|ConnectionException
     */
    public function __invoke(User $user, GoogleTokens $tokens): GoogleCalendarConnection
    {
        $connection = $user->googleCalendarConnection()->firstOrNew();
        $previousCalendarId = $connection->calendar_id;

        $connection->fill([
            'google_email' => $tokens->email ?? $connection->google_email ?? '',
            'access_token' => $tokens->accessToken,
            'refresh_token' => $tokens->refreshToken,
            'token_expires_at' => $tokens->expiresAt,
            'calendar_id' => null,
            'connected_at' => now(),
            'last_error' => null,
            'disconnected_reason' => null,
        ]);

        $calendarId = $previousCalendarId !== null && $this->client->calendarExists($connection, $previousCalendarId)
            ? $previousCalendarId
            : $this->client->createCalendar($connection, self::CALENDAR_NAME, CalendarTimezone::for($user));

        $connection->calendar_id = $calendarId;
        $connection->save();

        return $connection;
    }
}
