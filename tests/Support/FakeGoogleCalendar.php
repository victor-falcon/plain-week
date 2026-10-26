<?php

namespace Tests\Support;

use GuzzleHttp\Promise\PromiseInterface;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;

/**
 * An in-memory Calendar API for the events of one calendar: insert (`409` on a taken id), update (`404` once the
 * user deleted the event), delete. It records every event request, so tests can tell what Plain Week sent.
 */
class FakeGoogleCalendar
{
    /** @var array<string, array<string, mixed>> Live events by id. */
    public array $events = [];

    /** @var array<string, true> Ids of events the user deleted in Google (kept as cancelled). */
    public array $cancelled = [];

    /** @var list<array{method: string, eventId: string|null, body: array<string, mixed>}> */
    public array $requests = [];

    /** @var list<PromiseInterface> Canned answers for the next requests, before the calendar handles them. */
    public array $queued = [];

    public bool $calendarExists = true;

    public function __construct(public readonly string $calendarId) {}

    public static function install(string $calendarId): self
    {
        $fake = new self($calendarId);

        Http::fake(['https://www.googleapis.com/calendar/v3/calendars/*' => fn (Request $request) => $fake->handle($request)]);

        return $fake;
    }

    /**
     * The user deletes an event in Google Calendar.
     */
    public function deleteInGoogle(string $eventId): void
    {
        unset($this->events[$eventId]);
        $this->cancelled[$eventId] = true;
    }

    /**
     * @return list<string> Method and event id of each request, like `POST abc`.
     */
    public function calls(): array
    {
        return array_map(fn (array $request) => trim("{$request['method']} {$request['eventId']}"), $this->requests);
    }

    /**
     * @return array<string, mixed>
     */
    public function onlyEvent(): array
    {
        expect($this->events)->toHaveCount(1);

        return array_values($this->events)[0];
    }

    private function handle(Request $request): PromiseInterface
    {
        $path = (string) parse_url($request->url(), PHP_URL_PATH);
        $prefix = '/calendar/v3/calendars/'.rawurlencode($this->calendarId).'/events';

        if (! str_starts_with($path, $prefix)) {
            return Http::response(['error' => ['code' => 404, 'message' => 'Not Found']], 404);
        }

        $eventId = rawurldecode(ltrim(substr($path, strlen($prefix)), '/')) ?: null;
        /** @var array<string, mixed> $body */
        $body = $request->data();
        $this->requests[] = ['method' => $request->method(), 'eventId' => $eventId ?? ($body['id'] ?? null), 'body' => $body];

        if ($this->queued !== []) {
            return array_shift($this->queued);
        }

        if (! $this->calendarExists) {
            return Http::response(['error' => ['code' => 404, 'message' => 'Not Found']], 404);
        }

        return match ($request->method()) {
            'POST' => $this->insert($body),
            'PUT' => $this->update((string) $eventId, $body),
            'DELETE' => $this->delete((string) $eventId),
            default => Http::response(null, 405),
        };
    }

    /**
     * @param  array<string, mixed>  $body
     */
    private function insert(array $body): PromiseInterface
    {
        $id = (string) $body['id'];

        if (isset($this->events[$id]) || isset($this->cancelled[$id])) {
            return Http::response(['error' => ['code' => 409, 'message' => 'The requested identifier already exists.']], 409);
        }

        $this->events[$id] = $body;

        return Http::response($body);
    }

    /**
     * @param  array<string, mixed>  $body
     */
    private function update(string $eventId, array $body): PromiseInterface
    {
        if (! isset($this->events[$eventId])) {
            return Http::response(['error' => ['code' => 404, 'message' => 'Not Found']], 404);
        }

        $this->events[$eventId] = $body;

        return Http::response($body);
    }

    private function delete(string $eventId): PromiseInterface
    {
        if (! isset($this->events[$eventId])) {
            return Http::response(['error' => ['code' => 410, 'message' => 'Resource has been deleted']], 410);
        }

        unset($this->events[$eventId]);

        return Http::response(null, 204);
    }
}
