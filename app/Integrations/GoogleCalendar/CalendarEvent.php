<?php

namespace App\Integrations\GoogleCalendar;

use App\Integrations\Calendar\PlannerEvent;
use App\Tasks\Occurrence;

/**
 * The Google Calendar event for one planner item (see {@see PlannerEvent}). Its hash tells whether the event in Google
 * is still current.
 */
final readonly class CalendarEvent
{
    /**
     * @param  string  $key  What identifies the item across edits and moves (see {@see PlannerEvent::keyFor}).
     * @param  array<string, mixed>  $body  The event resource, without its id.
     */
    private function __construct(
        public string $key,
        public string $date,
        public array $body,
    ) {}

    public static function for(Occurrence $item, string $timeZone): self
    {
        $event = PlannerEvent::for($item, $timeZone);

        return new self($event->key, $event->date, [
            'summary' => $event->summary,
            'description' => $event->description,
            ...self::when($event, $timeZone),
            'source' => ['title' => 'Plain Week', 'url' => $event->link],
            // Plain Week sends its own notifications.
            'reminders' => ['useDefault' => false, 'overrides' => []],
            'status' => 'confirmed',
        ]);
    }

    public function hash(): string
    {
        return hash('sha256', (string) json_encode($this->body));
    }

    /**
     * @return array<string, mixed>
     */
    public function withId(string $eventId): array
    {
        return ['id' => $eventId, ...$this->body];
    }

    /**
     * @return array{start: array<string, string>, end: array<string, string>}
     */
    private static function when(PlannerEvent $event, string $timeZone): array
    {
        if ($event->start === null || $event->end === null) {
            return [
                'start' => ['date' => $event->date],
                'end' => ['date' => $event->dayAfter()],
            ];
        }

        return [
            'start' => ['dateTime' => $event->start->toRfc3339String(), 'timeZone' => $timeZone],
            'end' => ['dateTime' => $event->end->toRfc3339String(), 'timeZone' => $timeZone],
        ];
    }
}
