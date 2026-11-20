<?php

return [

    /*
    |--------------------------------------------------------------------------
    | MCP server
    |--------------------------------------------------------------------------
    |
    | Plain Week's MCP server (`/mcp`) lets AI agents read and plan the week.
    | On by default; `MCP_ENABLED=false` removes `/mcp` (404). OAuth, its
    | metadata and the app API (`/api/v1`) stay. See docs/architecture.md.
    |
    */

    'enabled' => (bool) env('MCP_ENABLED', true),

    /*
    | Requests a signed-in agent may send to `/mcp` per minute.
    */

    'rate_limit' => (int) env('MCP_RATE_LIMIT', 120),

    /*
    |--------------------------------------------------------------------------
    | Redirect Domains
    |--------------------------------------------------------------------------
    |
    | The domains OAuth clients may use for redirect URIs when they register
    | themselves (dynamic client registration). Agents and apps live anywhere
    | (claude.ai, localhost callbacks of desktop and CLI clients), so any
    | domain is allowed; the user still approves every client.
    |
    */

    'redirect_domains' => [
        '*',
    ],

    /*
    |--------------------------------------------------------------------------
    | Allowed Custom Schemes
    |--------------------------------------------------------------------------
    |
    | Private-use URI schemes (RFC 8252) native clients may redirect to, for
    | example `plainweek://oauth/callback` for the Plain Week apps. Loopback
    | redirects (`http://127.0.0.1:<port>/…`) are accepted anyway.
    |
    */

    'custom_schemes' => ['plainweek'],

    /*
    |--------------------------------------------------------------------------
    | Authorization Server
    |--------------------------------------------------------------------------
    |
    | The OAuth issuer in the metadata endpoints; null means `url('/')`.
    |
    */

    'authorization_server' => null,

    /*
    | Plain Week connects to no outside MCP servers.
    */

    'clients' => [],

];
