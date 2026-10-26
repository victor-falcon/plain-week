<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * A user's link to their Google account for the one-way calendar sync.
 *
 * @property int $id
 * @property int $user_id
 * @property string $google_email
 * @property string $access_token
 * @property string $refresh_token
 * @property Carbon $token_expires_at
 * @property string|null $calendar_id
 * @property Carbon $connected_at
 * @property string|null $last_error
 * @property string|null $disconnected_reason
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 */
#[Fillable(['google_email', 'access_token', 'refresh_token', 'token_expires_at', 'calendar_id', 'connected_at', 'last_error', 'disconnected_reason'])]
#[Hidden(['access_token', 'refresh_token'])]
class GoogleCalendarConnection extends Model
{
    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'access_token' => 'encrypted',
            'refresh_token' => 'encrypted',
            'token_expires_at' => 'datetime',
            'connected_at' => 'datetime',
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
     * Google no longer accepts the tokens (revoked, expired or the password
     * changed): nothing syncs until the user reconnects.
     */
    public function isBroken(): bool
    {
        return $this->disconnected_reason !== null;
    }
}
