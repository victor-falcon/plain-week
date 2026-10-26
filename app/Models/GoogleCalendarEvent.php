<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * The Google Calendar event that stands for one planner item of a connection.
 *
 * @property int $id
 * @property int $google_calendar_connection_id
 * @property string $key The task id of a plain task, or `${series_id}:${occurrence_date}` for an occurrence.
 * @property string $google_event_id
 * @property string $date 'YYYY-MM-DD'
 * @property string|null $payload_hash Null until Google confirmed the event.
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 */
#[Fillable(['key', 'google_event_id', 'date', 'payload_hash'])]
class GoogleCalendarEvent extends Model
{
    /**
     * @return BelongsTo<GoogleCalendarConnection, $this>
     */
    public function connection(): BelongsTo
    {
        return $this->belongsTo(GoogleCalendarConnection::class, 'google_calendar_connection_id');
    }
}
