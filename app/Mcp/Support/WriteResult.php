<?php

namespace App\Mcp\Support;

/**
 * What a write tool returns: the result for the agent, plus the activity log entry (a readable summary and the ids of
 * the tasks it touched).
 */
final readonly class WriteResult
{
    /**
     * @param  array<string, mixed>  $data
     * @param  list<string>  $taskIds
     */
    public function __construct(
        public array $data,
        public string $summary,
        public array $taskIds,
    ) {}
}
