<?php

namespace App\Push;

/**
 * What the push services answered, by subscription endpoint. A failure that is neither is transient and only logged.
 */
final readonly class PushReport
{
    /**
     * @param  list<string>  $delivered  Endpoints that accepted at least one message.
     * @param  list<string>  $expired  Endpoints that are gone (`404`/`410`): the browser unsubscribed.
     */
    public function __construct(
        public array $delivered = [],
        public array $expired = [],
    ) {}
}
