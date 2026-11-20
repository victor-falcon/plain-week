<?php

namespace App\Agents;

/**
 * Who is calling the MCP server: a personal access token (`token`, id and name of the token) or an OAuth app
 * (`oauth`, id and name of the client it registered).
 */
final readonly class AgentClient
{
    public const string TOKEN = 'token';

    public const string OAUTH = 'oauth';

    /**
     * @param  self::TOKEN|self::OAUTH  $type
     */
    public function __construct(
        public string $type,
        public string $id,
        public string $name,
    ) {}
}
