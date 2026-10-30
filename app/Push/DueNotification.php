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

    /**
     * Push services take about 4 KB of encrypted payload; a task text can be longer.
     */
    private const int MAX_TITLE_LENGTH = 120;

    public function message(): PushMessage
    {
        $time = $this->occurrence->time;

        return new PushMessage(
            title: mb_strimwidth($this->occurrence->text, 0, self::MAX_TITLE_LENGTH, '…'),
            body: match ($this->kind) {
                NotificationKind::Morning => __('Today'),
                NotificationKind::Reminder => __('In :minutes minutes · :time', ['minutes' => DueNotifications::REMINDER_LEAD_MINUTES, 'time' => $time]),
            },
            url: '/?task='.rawurlencode($this->occurrence->id),
            tag: "{$this->kind->value}:{$this->occurrence->id}:{$this->date}",
        );
    }
}
