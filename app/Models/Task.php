<?php

namespace App\Models;

use App\Casts\UtcMillisDateTime;
use App\Enums\TaskColor;
use App\Tasks\PlannerItem;
use Carbon\CarbonImmutable;
use Database\Factories\TaskFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A planner task. The client owns every field except `user_id` and `version`; timestamps are client-supplied and
 * `deleted_at` is a sync tombstone, so neither Eloquent timestamps nor soft deletes are used.
 *
 * @property string $id
 * @property int $user_id
 * @property string $text
 * @property string|null $date
 * @property int|null $someday_column
 * @property string $position
 * @property bool $done
 * @property CarbonImmutable|null $done_at
 * @property TaskColor $color
 * @property string|null $time
 * @property string $notes
 * @property list<array{id: string, text: string, done: bool}> $subtasks
 * @property array{type: 'daily'|'weekly'|'monthly', every?: int, weekdays?: list<int>, day?: int, until?: string|null}|null $recurrence
 * @property string|null $series_id
 * @property string|null $occurrence_date
 * @property CarbonImmutable $created_at
 * @property CarbonImmutable $updated_at
 * @property CarbonImmutable|null $deleted_at
 * @property int $version
 *
 * @phpstan-import-type TaskRecord from PlannerItem
 */
#[Fillable([
    'id', 'text', 'date', 'someday_column', 'position', 'done', 'done_at', 'color', 'time', 'notes', 'subtasks',
    'recurrence', 'series_id', 'occurrence_date', 'created_at', 'updated_at', 'deleted_at',
])]
class Task extends Model
{
    /** @use HasFactory<TaskFactory> */
    use HasFactory;

    public $incrementing = false;

    public $timestamps = false;

    protected $keyType = 'string';

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'user_id' => 'integer',
            'someday_column' => 'integer',
            'done' => 'boolean',
            'done_at' => UtcMillisDateTime::class,
            'color' => TaskColor::class,
            'subtasks' => 'array',
            'recurrence' => 'array',
            'created_at' => UtcMillisDateTime::class,
            'updated_at' => UtcMillisDateTime::class,
            'deleted_at' => UtcMillisDateTime::class,
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
     * The sync wire shape of the row (snake_case, ISO-8601 UTC timestamps with milliseconds), as pushed and pulled.
     *
     * @return TaskRecord
     */
    public function toRecord(): array
    {
        return [
            'id' => $this->id,
            'text' => $this->text,
            'date' => $this->date,
            'someday_column' => $this->someday_column,
            'position' => $this->position,
            'done' => $this->done,
            'done_at' => $this->done_at?->format(UtcMillisDateTime::WIRE_FORMAT),
            'color' => $this->color->value,
            'time' => $this->time,
            'notes' => $this->notes,
            'subtasks' => $this->subtasks,
            'recurrence' => $this->recurrence,
            'series_id' => $this->series_id,
            'occurrence_date' => $this->occurrence_date,
            'created_at' => $this->created_at->format(UtcMillisDateTime::WIRE_FORMAT),
            'updated_at' => $this->updated_at->format(UtcMillisDateTime::WIRE_FORMAT),
            'deleted_at' => $this->deleted_at?->format(UtcMillisDateTime::WIRE_FORMAT),
        ];
    }
}
