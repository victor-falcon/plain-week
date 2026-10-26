<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\MassPrunable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Carbon;

/**
 * A push notification already handed to the push services, kept a few days so a scheduler run that repeats or catches
 * up never sends it twice.
 *
 * @property int $id
 * @property int $user_id
 * @property string $occurrence_key
 * @property string $kind
 * @property string $date
 * @property Carbon $created_at
 */
class SentNotification extends Model
{
    use MassPrunable;

    public const UPDATED_AT = null;

    /**
     * Far longer than the catch-up window, so pruning never lets a notification through again.
     *
     * @return Builder<self>
     */
    public function prunable(): Builder
    {
        return self::query()->where('created_at', '<', now()->subDays(3));
    }
}
