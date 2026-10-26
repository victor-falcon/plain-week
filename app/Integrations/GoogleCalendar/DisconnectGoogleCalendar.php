<?php

namespace App\Integrations\GoogleCalendar;

use App\Models\GoogleCalendarConnection;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\RequestException;
use Throwable;

/**
 * Removes a connection: deletes the "Plain Week" calendar (nothing would keep
 * it up to date), revokes the grant and forgets the tokens. If Google cannot
 * delete the calendar right now the connection stays, so the user can retry
 * instead of being left with a calendar Plain Week can no longer reach. A
 * broken connection has no working tokens: it is just forgotten.
 */
class DisconnectGoogleCalendar
{
    public function __construct(
        private readonly GoogleCalendarClient $client,
        private readonly GoogleOAuth $oauth,
    ) {}

    /**
     * @throws RequestException|ConnectionException
     */
    public function __invoke(GoogleCalendarConnection $connection): void
    {
        $calendarId = $connection->calendar_id;

        try {
            if (! $connection->isBroken() && $calendarId !== null) {
                $this->client->deleteCalendar($connection, $calendarId);
            }
        } catch (GoogleCalendarDisconnected) {
            // The grant turned out to be gone: nothing left to clean up with these tokens.
        }

        if (! $connection->isBroken()) {
            try {
                $this->oauth->revoke($connection->refresh_token);
            } catch (Throwable $e) {
                // The calendar is gone; a grant left behind is harmless and the user can remove it in Google.
                report($e);
            }
        }

        $connection->delete();
    }
}
