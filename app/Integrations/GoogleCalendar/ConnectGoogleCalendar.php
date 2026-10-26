<?php

namespace App\Integrations\GoogleCalendar;

use App\Jobs\SyncGoogleCalendar;
use App\Models\GoogleCalendarConnection;
use App\Models\User;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\RequestException;
use Throwable;

/**
 * Stores the tokens from a finished OAuth flow and makes sure the account has
 * its "Plain Week" calendar: a reconnect to the same Google account keeps the
 * calendar it already had when it still exists, otherwise a new one is
 * created. Switching to another Google account first cleans up the old one.
 * Then the user's tasks are synced to it in the background.
 */
class ConnectGoogleCalendar
{
    public const string CALENDAR_NAME = 'Plain Week';

    public function __construct(
        private readonly GoogleCalendarClient $client,
        private readonly DisconnectGoogleCalendar $disconnect,
    ) {}

    /**
     * @param  GoogleTokens  $tokens  With a refresh token and the account email.
     *
     * @throws GoogleCalendarDisconnected|RequestException|ConnectionException
     */
    public function __invoke(User $user, GoogleTokens $tokens): GoogleCalendarConnection
    {
        $connection = $user->googleCalendarConnection;

        if ($connection !== null && $connection->google_email !== $tokens->email) {
            try {
                ($this->disconnect)($connection);
            } catch (Throwable $e) {
                report($e);
                $connection->delete();
            }

            $connection = null;
        }

        $connection ??= $user->googleCalendarConnection()->make();
        $previousCalendarId = $connection->calendar_id;

        $connection->fill([
            'google_email' => $tokens->email,
            'access_token' => $tokens->accessToken,
            'refresh_token' => $tokens->refreshToken,
            'token_expires_at' => $tokens->expiresAt,
            'calendar_id' => null,
            'connected_at' => now(),
            'last_error' => null,
            'disconnected_reason' => null,
        ]);

        $connection->calendar_id = $previousCalendarId !== null && $this->client->calendarExists($connection, $previousCalendarId)
            ? $previousCalendarId
            : $this->client->createCalendar($connection, self::CALENDAR_NAME, $user->timezoneOrDefault());
        $connection->save();

        // The events Plain Week sent went to the old calendar.
        if ($connection->calendar_id !== $previousCalendarId) {
            $connection->events()->delete();
        }

        SyncGoogleCalendar::dispatch($user->id);

        return $connection;
    }
}
