<?php

return [

    /*
    |--------------------------------------------------------------------------
    | SaaS mode
    |--------------------------------------------------------------------------
    |
    | Off by default: a self-hosted instance has free accounts that sync and no
    | billing at all. When on (plainweek.eu), an account needs a paid plan
    | (weekly subscription or lifetime) to sync; guests still plan locally.
    |
    */

    'enabled' => (bool) env('SAAS_ENABLED', false),

    /*
    | Stripe prices, referenced by lookup key (never by ID) so test and live
    | mode share the same configuration.
    */

    'prices' => [
        'weekly' => env('STRIPE_PRICE_WEEKLY', 'plainweek_weekly'),
        'lifetime' => env('STRIPE_PRICE_LIFETIME', 'plainweek_lifetime'),
    ],

    /*
    | Stripe coupon applied to lifetime purchases (e.g. "LAUNCH75"). Empty
    | means no discount.
    */

    'launch_coupon' => env('SAAS_LAUNCH_COUPON') ?: null,

    /*
    | Who sells the service, shown in the terms and privacy pages.
    */

    'seller' => [
        'name' => env('SAAS_SELLER_NAME', 'the Plain Week operator'),
        'email' => env('SAAS_CONTACT_EMAIL', env('MAIL_FROM_ADDRESS', 'hello@example.com')),
    ],

];
