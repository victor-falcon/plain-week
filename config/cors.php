<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Cross-Origin Resource Sharing (CORS)
    |--------------------------------------------------------------------------
    |
    | Token clients that run in a webview (a native app's own origin) call the
    | app API and the OAuth endpoints a public client needs: discovery,
    | registration and the token exchange. They send Bearer tokens, never
    | cookies, so any origin may call them. Everything else is same-origin.
    |
    */

    'paths' => [
        'api/*',
        'oauth/token',
        'oauth/register',
        '.well-known/oauth-protected-resource',
        '.well-known/oauth-protected-resource/*',
        '.well-known/oauth-authorization-server',
        '.well-known/oauth-authorization-server/*',
    ],

    'allowed_methods' => ['*'],

    'allowed_origins' => ['*'],

    'allowed_origins_patterns' => [],

    'allowed_headers' => ['*'],

    // An OAuth client reads the resource metadata URL from a 401.
    'exposed_headers' => ['WWW-Authenticate'],

    'max_age' => 0,

    'supports_credentials' => false,

];
