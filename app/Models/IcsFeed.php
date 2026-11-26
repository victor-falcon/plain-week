<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * A user's ICS subscription feed: the secret token in its URL. See docs/architecture.md, "ICS feed".
 *
 * @property int $id
 * @property int $user_id
 * @property string $token_hash
 * @property string $token
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 */
#[Fillable(['token', 'token_hash'])]
#[Hidden(['token', 'token_hash'])]
class IcsFeed extends Model
{
    /** Random bytes in a token (43 characters once encoded). */
    private const int TOKEN_BYTES = 32;

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'token' => 'encrypted',
        ];
    }

    /**
     * Turns the feed on for `$user`, or gives it a new token when it is on: the previous URL stops working at once.
     */
    public static function enableFor(User $user): self
    {
        $token = self::newToken();

        return $user->icsFeed()->updateOrCreate([], ['token' => $token, 'token_hash' => self::hash($token)]);
    }

    public static function findByToken(string $token): ?self
    {
        return self::query()->where('token_hash', self::hash($token))->first();
    }

    /**
     * The URL calendar apps subscribe to (https; the `webcal://` variant is the same URL with that scheme).
     */
    public function url(): string
    {
        return route('ics-feed.show', ['token' => $this->token]);
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /**
     * 32 random bytes, base64url without padding.
     */
    private static function newToken(): string
    {
        return rtrim(strtr(base64_encode(random_bytes(self::TOKEN_BYTES)), '+/', '-_'), '=');
    }

    private static function hash(string $token): string
    {
        return hash('sha256', $token);
    }
}
