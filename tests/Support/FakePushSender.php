<?php

namespace Tests\Support;

use App\Push\PushDelivery;
use App\Push\PushReport;
use App\Push\PushSender;

/**
 * Records what would be pushed. Every endpoint accepts its messages except those marked expired.
 */
final class FakePushSender implements PushSender
{
    /** @var list<PushDelivery> */
    public array $deliveries = [];

    /** @var list<string> */
    private array $expired = [];

    public static function install(): self
    {
        $fake = new self;
        app()->instance(PushSender::class, $fake);

        return $fake;
    }

    public function expire(string $endpoint): self
    {
        $this->expired[] = $endpoint;

        return $this;
    }

    public function send(array $deliveries): PushReport
    {
        array_push($this->deliveries, ...$deliveries);
        $endpoints = array_values(array_unique(array_map(fn (PushDelivery $delivery) => $delivery->subscription->endpoint, $deliveries)));

        return new PushReport(
            delivered: array_values(array_diff($endpoints, $this->expired)),
            expired: array_values(array_intersect($endpoints, $this->expired)),
        );
    }

    /**
     * The messages pushed so far, one per notification (the first subscription's copy).
     *
     * @return list<array{title: string, body: string, url: string, tag: string}>
     */
    public function messages(): array
    {
        $messages = [];

        foreach ($this->deliveries as $delivery) {
            $messages[$delivery->message->tag] ??= (array) $delivery->message;
        }

        /** @var list<array{title: string, body: string, url: string, tag: string}> */
        return array_values($messages);
    }

    /**
     * @return list<string>
     */
    public function tags(): array
    {
        return array_column($this->messages(), 'tag');
    }
}
