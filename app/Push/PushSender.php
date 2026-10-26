<?php

namespace App\Push;

/**
 * Encrypts and hands messages to the browsers' push services. Bound to {@see WebPushSender}; tests swap in a fake.
 */
interface PushSender
{
    /**
     * Throws only when nothing could be attempted; per-delivery failures are in the report.
     *
     * @param  list<PushDelivery>  $deliveries
     */
    public function send(array $deliveries): PushReport;
}
