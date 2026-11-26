<?php

namespace App\Models;

use App\Casts\UtcMillisDateTime;
use App\Enums\TaskColor;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * The name a user gave one task color, synced like a task (last-write-wins on `updated_at`). An empty name means the
 * color's default (translated) name. The client owns every field except `user_id` and `version`.
 *
 * @property int $id
 * @property int $user_id
 * @property TaskColor $color
 * @property string $name
 * @property CarbonImmutable $updated_at
 * @property int $version
 *
 * @phpstan-type TaskLabelRecord array{color: string, name: string, updated_at: string}
 */
#[Fillable(['color', 'name', 'updated_at'])]
class TaskLabel extends Model
{
    /**
     * The longest name, in characters, once trimmed.
     */
    public const int MAX_NAME_LENGTH = 24;

    public $timestamps = false;

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'user_id' => 'integer',
            'color' => TaskColor::class,
            'updated_at' => UtcMillisDateTime::class,
            'version' => 'integer',
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
     * The sync wire shape of the row, as pushed and pulled.
     *
     * @return TaskLabelRecord
     */
    public function toRecord(): array
    {
        return [
            'color' => $this->color->value,
            'name' => $this->name,
            'updated_at' => $this->updated_at->format(UtcMillisDateTime::WIRE_FORMAT),
        ];
    }
}
