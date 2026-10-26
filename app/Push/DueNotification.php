<?php

namespace App\Push;

use App\Tasks\Occurrence;

/**
 * One notification the scheduler owes a user: a morning one or a reminder for one occurrence.
 */
final readonly class DueNotification
{
    /**
     * @param  string  $date  The local date it is for ('YYYY-MM-DD'): the morning's day, or the occurrence's.
     */
    public function __construct(
        public NotificationKind $kind,
        public Occurrence $occurrence,
        public string $date,
    ) {}

    /**
     * What identifies it across runs: the occurrence by `(seriesId, occurrenceDate)` when it belongs to a series (its id
     * changes once it is edited or moved), else by task id.
     */
    public function occurrenceKey(): string
    {
        return $this->occurrence->seriesId !== null && $this->occurrence->occurrenceDate !== null
            ? Occurrence::idFor($this->occurrence->seriesId, $this->occurrence->occurrenceDate)
            : $this->occurrence->id;
    }

    public function message(): PushMessage
    {
        $time = $this->occurrence->time;

        return new PushMessage(
            title: $this->occurrence->text,
            body: match ($this->kind) {
                NotificationKind::Morning => $time === null ? __('Today') : __('Today at :time', ['time' => $time]),
                NotificationKind::Reminder => __('In 5 minutes · :time', ['time' => $time]),
            },
            url: '/?task='.rawurlencode($this->occurrence->id),
            tag: "{$this->kind->value}:{$this->occurrence->id}:{$this->date}",
        );
    }
}
