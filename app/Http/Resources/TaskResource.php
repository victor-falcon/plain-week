<?php

namespace App\Http\Resources;

use App\Casts\UtcMillisDateTime;
use App\Models\Task;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * The sync wire shape of a task (snake_case, ISO-8601 UTC timestamps with milliseconds).
 *
 * @mixin Task
 */
class TaskResource extends JsonResource
{
    /**
     * Transform the resource into an array.
     *
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
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
            'created_at' => $this->created_at->format(UtcMillisDateTime::WIRE_FORMAT),
            'updated_at' => $this->updated_at->format(UtcMillisDateTime::WIRE_FORMAT),
            'deleted_at' => $this->deleted_at?->format(UtcMillisDateTime::WIRE_FORMAT),
        ];
    }
}
