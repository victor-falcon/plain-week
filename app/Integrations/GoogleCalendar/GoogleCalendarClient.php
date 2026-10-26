<?php

namespace App\Integrations\GoogleCalendar;

use App\Models\GoogleCalendarConnection;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\PendingRequest;
use Illuminate\Http\Client\RequestException;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Http;

/**
 * The Calendar API calls Plain Week makes on behalf of a connection. The
 * access token is refreshed first when it has expired (or is about to); a
 * refused refresh token marks the connection broken and throws
 * {@see GoogleCalendarDisconnected}. Event calls throw
 * {@see GoogleCalendarRateLimited} when Google asks to slow down and
 * {@see GoogleCalendarMissing} when the calendar is gone. Other failures throw
 * the HTTP client's exceptions and are transient.
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

        // Deleted, or it belongs to another Google account. Other 403s (rate limits, quota) are transient.
        if (in_array($response->status(), [404, 410], true)
            || ($response->status() === 403 && in_array($response->json('error.errors.0.reason'), ['forbidden', 'notFound'], true))) {
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
     * Creates an event with the id it carries. Returns false when an event
     * with that id already exists (`409`): a previous attempt got through.
     *
     * @param  array<string, mixed>  $event
     *
     * @throws GoogleCalendarDisconnected|GoogleCalendarRateLimited|GoogleCalendarMissing|RequestException|ConnectionException
     */
    public function insertEvent(GoogleCalendarConnection $connection, string $calendarId, array $event): bool
    {
        $response = $this->eventRequest($connection, fn (PendingRequest $request) => $request
            ->post(self::eventsPath($calendarId), $event));

        if ($response->status() === 409) {
            return false;
        }

        if (in_array($response->status(), [404, 410], true)) {
            throw new GoogleCalendarMissing("Calendar {$calendarId} not found.");
        }

        $response->throw();

        return true;
    }

    /**
     * Replaces an event (a full update, so a timed event can become all-day
     * and back). Returns false when the event is gone (`404`/`410`): the user
     * deleted it in Google. An event Google keeps as cancelled comes back,
     * since the payload says `confirmed`.
     *
     * @param  array<string, mixed>  $event
     *
     * @throws GoogleCalendarDisconnected|GoogleCalendarRateLimited|RequestException|ConnectionException
     */
    public function updateEvent(GoogleCalendarConnection $connection, string $calendarId, string $eventId, array $event): bool
    {
        $response = $this->eventRequest($connection, fn (PendingRequest $request) => $request
            ->put(self::eventsPath($calendarId).'/'.rawurlencode($eventId), $event));

        if (in_array($response->status(), [404, 410], true)) {
            return false;
        }

        $response->throw();

        return true;
    }

    /**
     * Deletes an event; one that is already gone counts as deleted.
     *
     * @throws GoogleCalendarDisconnected|GoogleCalendarRateLimited|RequestException|ConnectionException
     */
    public function deleteEvent(GoogleCalendarConnection $connection, string $calendarId, string $eventId): void
    {
        $response = $this->eventRequest($connection, fn (PendingRequest $request) => $request
            ->delete(self::eventsPath($calendarId).'/'.rawurlencode($eventId)));

        if (! in_array($response->status(), [404, 410], true)) {
            $response->throw();
        }
    }

    /**
     * Sends an event request and turns rate limits into
     * {@see GoogleCalendarRateLimited}. A `401` means the access token stopped
     * working before it expired (revoked): it is marked expired, so the retry
     * refreshes it, or finds the grant gone.
     *
     * @param  callable(PendingRequest): Response  $send
     *
     * @throws GoogleCalendarDisconnected|GoogleCalendarRateLimited|RequestException|ConnectionException
     */
    private function eventRequest(GoogleCalendarConnection $connection, callable $send): Response
    {
        $response = $send($this->request($connection));
        $reason = $response->json('error.errors.0.reason');

        if ($response->status() === 429
            || ($response->status() === 403 && in_array($reason, ['rateLimitExceeded', 'userRateLimitExceeded'], true))) {
            $retryAfter = $response->header('Retry-After');

            throw new GoogleCalendarRateLimited(is_numeric($retryAfter) ? (int) $retryAfter : null);
        }

        if ($response->status() === 401) {
            $connection->forceFill(['token_expires_at' => now()])->save();
            $response->throw();
        }

        return $response;
    }

    private static function eventsPath(string $calendarId): string
    {
        return 'calendars/'.rawurlencode($calendarId).'/events';
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
            throw new GoogleCalendarDisconnected((string) $connection->disconnected_reason);
        }

        if ($connection->token_expires_at->isAfter(now()->addMinute())) {
            return $connection->access_token;
        }

        try {
            $tokens = $this->oauth->refresh($connection->refresh_token);
        } catch (GoogleCalendarDisconnected $e) {
            $connection->forceFill([
                'disconnected_reason' => GoogleCalendarDisconnected::INVALID_GRANT,
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
