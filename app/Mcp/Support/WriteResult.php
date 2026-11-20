<?php

namespace App\Mcp\Support;

/**
 * What a write tool returns: the result for the agent, plus the activity log entry (a readable summary and the ids of
 * the tasks it touched).
 */
final readonly class WriteResult
{
    /**
     * The touched ids, without nulls and duplicates.
     *
     * @var list<string>
     */
    public array $taskIds;

    /**
     * @param  array<string, mixed>  $data
     * @param  list<string|null>  $taskIds
     */
    public function __construct(
        public array $data,
        public string $summary,
        array $taskIds,
    ) {
        $this->taskIds = array_values(array_unique(array_filter($taskIds, fn (?string $id) => $id !== null)));
    }
}
