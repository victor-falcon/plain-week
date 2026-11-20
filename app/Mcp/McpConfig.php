<?php

namespace App\Mcp;

/**
 * The MCP server for AI agents is on unless `MCP_ENABLED=false`; when off,
 * `/mcp`, the OAuth and metadata routes and Settings › Agents are 404.
 */
final class McpConfig
{
    public static function enabled(): bool
    {
        return (bool) config('mcp.enabled');
    }
}
