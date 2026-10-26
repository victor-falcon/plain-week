<?php

namespace App\Integrations\GoogleCalendar;

use RuntimeException;

/**
 * Google asked Plain Week to slow down (`429`, or a `403` with a rate limit reason). Try again later.
 */
class GoogleCalendarRateLimited extends RuntimeException
{
    /**
     * @param  int|null  $retryAfter  Seconds Google asked to wait (`Retry-After`), if it said.
     */
    public function __construct(public readonly ?int $retryAfter = null)
    {
        parent::__construct('Google Calendar rate limit exceeded.');
    }
}
