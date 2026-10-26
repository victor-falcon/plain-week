<?php

namespace App\Integrations\GoogleCalendar;

use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\RequestException;

/**
 * Runs the event calls of one sync run so that Google refusing one event (a `4xx` the client does not handle itself)
 * does not hold back the rest. The first refusal is reported and kept; the run carries on.
 */
final class Refusals
{
    public ?string $first = null;

    /**
     * @param  callable(): void  $call
     *
     * @throws GoogleCalendarDisconnected|GoogleCalendarRateLimited|GoogleCalendarMissing|RequestException|ConnectionException
     */
    public function attempt(callable $call): void
    {
        try {
            $call();
        } catch (RequestException $e) {
            if (! $e->response->clientError() || $e->response->status() === 401) {
                throw $e;
            }

            if ($this->first === null) {
                report($e);
                $this->first = (string) ($e->response->json('error.message') ?? "Google answered {$e->response->status()}.");
            }
        }
    }
}
