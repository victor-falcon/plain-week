<?php

namespace App\Integrations\GoogleCalendar;

use App\Models\GoogleCalendarConnection;
use Throwable;

/**
 * Removes a connection: deletes the "Plain Week" calendar (nothing would keep
 * it up to date), revokes the grant and forgets the tokens. Google is cleaned
 * up best effort; the connection is gone locally whatever Google answers.
 */
class DisconnectGoogleCalendar
{
    public function __construct(
        private readonly GoogleCalendarClient $client,
        private readonly GoogleOAuth $oauth,
    ) {}

    public function __invoke(GoogleCalendarConnection $connection): void
    {
        if (! $connection->isBroken()) {
            if ($connection->calendar_id !== null) {
                $this->bestEffort(fn () => $this->client->deleteCalendar($connection, (string) $connection->calendar_id));
            }

            $this->bestEffort(fn () => $this->oauth->revoke($connection->refresh_token));
        }

        $connection->delete();
    }

    private function bestEffort(callable $call): void
    {
        try {
            $call();
        } catch (GoogleCalendarDisconnected) {
            // Access is already gone: nothing left to clean up with these tokens.
        } catch (Throwable $e) {
            report($e);
        }
    }
}
