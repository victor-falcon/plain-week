<?php

namespace App\Push;

use App\Models\PushSubscription;

final readonly class PushDelivery
{
    public function __construct(
        public PushSubscription $subscription,
        public PushMessage $message,
    ) {}
}
