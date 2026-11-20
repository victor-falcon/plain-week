<?php

namespace App\Http\Middleware;

use App\Mcp\McpConfig;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Settings › Agents exists only while the MCP server is on (`MCP_ENABLED`,
 * default true); elsewhere its routes are 404, like `/mcp` itself.
 */
class EnsureMcpEnabled
{
    /**
     * @param  Closure(Request): Response  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        abort_unless(McpConfig::enabled(), 404);

        return $next($request);
    }
}
