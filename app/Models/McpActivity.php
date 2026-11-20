<?php

namespace App\Models;

use App\Agents\AgentClient;
use Database\Factories\McpActivityFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\MassPrunable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * One successful write an AI agent made through the MCP server: which tool, which client (personal token or OAuth
 * app), the tasks it touched and a readable summary. Settings › Agents lists them; reads are not logged. Pruned after
 * {@see self::RETENTION_DAYS} days.
 *
 * @property int $id
 * @property int $user_id
 * @property string $tool
 * @property string $client_type
 * @property string $client_id
 * @property string $client_name
 * @property list<string> $task_ids
 * @property string $summary
 * @property Carbon $created_at
 */
#[Fillable(['tool', 'client_type', 'client_id', 'client_name', 'task_ids', 'summary'])]
class McpActivity extends Model
{
    /** @use HasFactory<McpActivityFactory> */
    use HasFactory;

    use MassPrunable;

    public const int RETENTION_DAYS = 90;

    /**
     * The most task ids one entry keeps (an import can touch thousands).
     */
    public const int MAX_TASK_IDS = 200;

    public const UPDATED_AT = null;

    /**
     * Records a write for `$user`.
     *
     * @param  list<string>  $taskIds
     */
    public static function record(User $user, AgentClient $client, string $tool, string $summary, array $taskIds): self
    {
        return $user->mcpActivities()->create([
            'tool' => $tool,
            'client_type' => $client->type,
            'client_id' => $client->id,
            'client_name' => $client->name,
            'task_ids' => array_slice(array_values(array_unique($taskIds)), 0, self::MAX_TASK_IDS),
            'summary' => mb_strimwidth($summary, 0, 500, '…'),
        ]);
    }

    /**
     * @return Builder<self>
     */
    public function prunable(): Builder
    {
        return self::query()->where('created_at', '<', now()->subDays(self::RETENTION_DAYS));
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'task_ids' => 'array',
        ];
    }
}
