<?php

namespace App\Push;

/**
 * The outcome of a {@see PushSender::send()}: one result per delivery, under the delivery's index.
 */
final readonly class PushReport
{
    /**
     * @param  list<PushDelivery>  $deliveries
     * @param  array<int, PushResult>  $results
     */
    public function __construct(
        public array $deliveries,
        public array $results,
    ) {}

    public function resultOf(int $index): PushResult
    {
        return $this->results[$index] ?? PushResult::Failed;
    }

    /**
     * The endpoints with at least one delivery that got this result.
     *
     * @return list<string>
     */
    public function endpoints(PushResult $result): array
    {
        $endpoints = [];

        foreach ($this->deliveries as $index => $delivery) {
            if ($this->resultOf($index) === $result) {
                $endpoints[$delivery->subscription->endpoint] = true;
            }
        }

        return array_keys($endpoints);
    }

    /**
     * Whether a message failed everywhere for a reason worth retrying: nothing delivered it and something may later.
     */
    public function shouldRetry(PushMessage $message): bool
    {
        $results = [];

        foreach ($this->deliveries as $index => $delivery) {
            if ($delivery->message === $message) {
                $results[] = $this->resultOf($index);
            }
        }

        return ! in_array(PushResult::Delivered, $results, true) && in_array(PushResult::Failed, $results, true);
    }
}
