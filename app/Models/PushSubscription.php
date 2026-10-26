<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * One browser's Web Push subscription (`PushSubscription.toJSON()` on the client).
 *
 * @property int $id
 * @property int $user_id
 * @property string $endpoint
 * @property string $endpoint_hash
 * @property string $p256dh
 * @property string $auth
 * @property string $content_encoding
 * @property string|null $user_agent
 * @property Carbon|null $last_used_at
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 */
#[Fillable(['user_id', 'endpoint', 'endpoint_hash', 'p256dh', 'auth', 'content_encoding', 'user_agent', 'last_used_at'])]
#[Hidden(['p256dh', 'auth'])]
class PushSubscription extends Model
{
    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'last_used_at' => 'datetime',
        ];
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /**
     * The value of the unique index: endpoints are URLs too long to index as they are.
     */
    public static function hashEndpoint(string $endpoint): string
    {
        return hash('sha256', $endpoint);
    }

    /**
     * @param  Builder<self>  $query
     * @param  list<string>  $endpoints
     * @return Builder<self>
     */
    public function scopeWhereEndpointIn(Builder $query, array $endpoints): Builder
    {
        return $query->whereIn('endpoint_hash', array_map(self::hashEndpoint(...), $endpoints));
    }
}
