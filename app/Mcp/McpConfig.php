<?php

namespace App\Mcp;

/**
 * The MCP server for AI agents is on unless `MCP_ENABLED=false`; when off, `/mcp` is 404 and Settings › Agents & apps
 * hides its MCP part. OAuth, its metadata and the app API (`/api/v1`) stay on either way.
 */
final class McpConfig
{
    public static function enabled(): bool
    {
        return (bool) config('mcp.enabled');
    }
}
