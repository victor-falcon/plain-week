<?php

namespace App\Integrations\GoogleCalendar;

/**
 * An event a sync run wants in the calendar.
 */
final readonly class WantedEvent
{
    /**
     * @param  bool  $creatable  Whether the run may create it, or only keep an existing one up to date.
     */
    public function __construct(
        public CalendarEvent $event,
        public bool $creatable,
    ) {}
}
