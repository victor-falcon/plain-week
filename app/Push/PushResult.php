<?php

namespace App\Push;

/**
 * What a push service answered to one delivery.
 */
enum PushResult
{
    case Delivered;

    /** `404`/`410`: the browser unsubscribed, so the subscription is gone for good. */
    case Expired;

    /** Anything else (5xx, 429, 413, a network error): worth retrying. */
    case Failed;
}
