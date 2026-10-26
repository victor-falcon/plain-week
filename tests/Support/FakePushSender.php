<?php

namespace Tests\Support;

use App\Push\PushDelivery;
use App\Push\PushReport;
use App\Push\PushResult;
use App\Push\PushSender;
use RuntimeException;

/**
 * Records what was pushed (accepted deliveries only). Every endpoint accepts its messages unless marked expired or
 * failing.
 */
final class FakePushSender implements PushSender
{
    /** @var list<PushDelivery> Accepted deliveries. */
    public array $deliveries = [];

    /** @var list<string> */
    private array $expired = [];

    private bool $unreachable = false;

    public static function install(): self
    {
        $fake = new self;
        app()->instance(PushSender::class, $fake);

        return $fake;
    }

    /** @var list<string> */
    private array $failing = [];

    public function expire(string $endpoint): self
    {
        $this->expired[] = $endpoint;

        return $this;
    }

    /**
     * Deliveries to the endpoint fail for a transient reason (5xx, 429) until `recover()`.
     */
    public function fail(string $endpoint): self
    {
        $this->failing[] = $endpoint;

        return $this;
    }

    public function recover(): self
    {
        $this->failing = [];

        return $this;
    }

    /**
     * The next sends throw, like the push services being unreachable.
     */
    public function unreachable(bool $unreachable = true): self
    {
        $this->unreachable = $unreachable;

        return $this;
    }

    public function send(array $deliveries): PushReport
    {
        if ($this->unreachable) {
            throw new RuntimeException('Push service unreachable.');
        }

        $results = [];

        foreach ($deliveries as $index => $delivery) {
            $endpoint = $delivery->subscription->endpoint;
            $results[$index] = match (true) {
                in_array($endpoint, $this->expired, true) => PushResult::Expired,
                in_array($endpoint, $this->failing, true) => PushResult::Failed,
                default => PushResult::Delivered,
            };

            if ($results[$index] === PushResult::Delivered) {
                $this->deliveries[] = $delivery;
            }
        }

        return new PushReport($deliveries, $results);
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
