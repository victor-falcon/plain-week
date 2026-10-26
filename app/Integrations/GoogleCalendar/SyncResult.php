<?php

namespace App\Integrations\GoogleCalendar;

/**
 * How a {@see SyncGoogleCalendarEvents} run ended.
 */
final readonly class SyncResult
{
    /**
     * @param  bool  $complete  False when the run stopped at its time limit with work left.
     * @param  string|null  $error  What Google said about an event it refused (the others went through).
     */
    public function __construct(
        public bool $complete,
        public ?string $error = null,
    ) {}
}
