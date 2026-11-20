<?php

use App\Http\Middleware\TouchAccessToken;
use App\Mcp\McpConfig;
use App\Mcp\Servers\PlainWeekServer;
use Illuminate\Support\Facades\Route;
use Laravel\Mcp\Facades\Mcp;

// OAuth 2.1 discovery for MCP clients and the native apps: protected resource and authorization server metadata
// (RFC 9728, RFC 8414) and dynamic client registration (POST /oauth/register). Authorization and tokens are
// Passport's /oauth routes. Always on: the app API (routes/api.php) needs them even with MCP_ENABLED=false.
// Throttled per IP: registration is open to anyone and each call stores a client.
Route::middleware('throttle:30,1')->group(fn () => Mcp::oauthRoutes());

// The MCP server for AI agents (docs/architecture.md#mcp-server). Off with MCP_ENABLED=false: `/mcp` does not exist then.
if (! McpConfig::enabled()) {
    return;
}

// Streamable HTTP. Bearer tokens only (the `api` guard: OAuth access tokens and personal access tokens), no session.
Mcp::web('/mcp', PlainWeekServer::class)
    ->middleware(['auth:api', TouchAccessToken::class, 'throttle:mcp'])
    ->name('mcp');
