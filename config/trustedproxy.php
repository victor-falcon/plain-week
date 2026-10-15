<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Trusted Proxies
    |--------------------------------------------------------------------------
    |
    | Proxies whose X-Forwarded-* headers are trusted, so URLs and secure
    | cookies follow the scheme and host the proxy received (for example
    | Traefik or Caddy terminating TLS). A comma-separated list of IPs or
    | CIDRs, or "*" to trust the direct caller. The Docker image sets "*".
    |
    */

    'proxies' => env('TRUSTED_PROXIES'),

];
