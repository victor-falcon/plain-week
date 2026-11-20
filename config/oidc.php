<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Single sign-on with an OpenID Connect identity provider
    |--------------------------------------------------------------------------
    |
    | "Log in with SSO" through an external IdP (Pocket ID, Authentik,
    | Keycloak...). It shows only once OIDC_ISSUER and OIDC_CLIENT_ID are set.
    | The kill switch defaults to on for a self-hosted instance and to off in
    | SaaS mode (plainweek.eu); an explicit OIDC_ENABLED always wins. Empty
    | (as the Docker Compose and Coolify files pass it) counts as unset.
    |
    */

    'enabled' => in_array(env('OIDC_ENABLED'), [null, ''], true)
        ? ! (bool) env('SAAS_ENABLED', false)
        : (bool) env('OIDC_ENABLED'),

    // The issuer URL: its discovery document is `<issuer>/.well-known/openid-configuration`.
    'issuer' => env('OIDC_ISSUER') ?: null,

    'client_id' => env('OIDC_CLIENT_ID') ?: null,

    // Empty for a public client (PKCE only).
    'client_secret' => env('OIDC_CLIENT_SECRET') ?: null,

    // The button text ("Log in with Authentik"). Empty shows the translated "Log in with SSO".
    'label' => env('OIDC_LABEL') ?: null,

    // Only the IdP: no password login, sign-up form or password reset (and no passkey login).
    'only' => (bool) env('OIDC_ONLY', false),

];
