<?php

namespace App\Integrations\GoogleCalendar;

use App\Models\GoogleCalendarConnection;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\PendingRequest;
use Illuminate\Http\Client\RequestException;
use Illuminate\Support\Facades\Http;

/**
 * The Calendar API calls Plain Week makes on behalf of a connection. The
 * access token is refreshed first when it has expired (or is about to); a
 * refused refresh token marks the connection broken and throws
 * {@see GoogleCalendarDisconnected}. Other failures throw the HTTP client's
 * exceptions and are transient.
 */
class GoogleCalendarClient
{
    private const string BASE_URL = 'https://www.googleapis.com/calendar/v3';

    public function __construct(private readonly GoogleOAuth $oauth) {}

    /**
     * Creates a secondary calendar and returns its id.
     *
     * @throws GoogleCalendarDisconnected|RequestException|ConnectionException
     */
    public function createCalendar(GoogleCalendarConnection $connection, string $summary, string $timeZone): string
    {
        return (string) $this->request($connection)
            ->post('calendars', ['summary' => $summary, 'timeZone' => $timeZone])
            ->throw()
            ->json('id');
    }

    /**
     * Whether a calendar this app created still exists in the account.
     *
     * @throws GoogleCalendarDisconnected|RequestException|ConnectionException
     */
    public function calendarExists(GoogleCalendarConnection $connection, string $calendarId): bool
    {
        $response = $this->request($connection)->get('calendars/'.rawurlencode($calendarId));

        // 403/404: deleted, or it belongs to another Google account.
        if (in_array($response->status(), [403, 404, 410], true)) {
            return false;
        }

        $response->throw();

        return true;
    }

    /**
     * Deletes a calendar; one that is already gone counts as deleted.
     *
     * @throws GoogleCalendarDisconnected|RequestException|ConnectionException
     */
    public function deleteCalendar(GoogleCalendarConnection $connection, string $calendarId): void
    {
        $response = $this->request($connection)->delete('calendars/'.rawurlencode($calendarId));

        if (! in_array($response->status(), [404, 410], true)) {
            $response->throw();
        }
    }

    /**
     * An authorized request to the Calendar API.
     *
     * @throws GoogleCalendarDisconnected|RequestException|ConnectionException
     */
    protected function request(GoogleCalendarConnection $connection): PendingRequest
    {
        return Http::baseUrl(self::BASE_URL)
            ->withToken($this->accessToken($connection))
            ->acceptJson()
            ->connectTimeout(5)
            ->timeout(15);
    }

    /**
     * @throws GoogleCalendarDisconnected|RequestException|ConnectionException
     */
    private function accessToken(GoogleCalendarConnection $connection): string
    {
        if ($connection->isBroken()) {
            throw new GoogleCalendarDisconnected($connection->disconnected_reason ?? 'invalid_grant');
        }

        if ($connection->token_expires_at->isAfter(now()->addMinute())) {
            return $connection->access_token;
        }

        try {
            $tokens = $this->oauth->refresh($connection->refresh_token);
        } catch (GoogleCalendarDisconnected $e) {
            $connection->forceFill([
                'disconnected_reason' => 'invalid_grant',
                'last_error' => $e->getMessage(),
            ])->save();

            throw $e;
        }

        $connection->forceFill([
            'access_token' => $tokens->accessToken,
            'refresh_token' => $tokens->refreshToken ?? $connection->refresh_token,
            'token_expires_at' => $tokens->expiresAt,
        ])->save();

        return $tokens->accessToken;
    }
}
