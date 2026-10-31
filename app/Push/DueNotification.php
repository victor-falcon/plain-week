<?php

namespace App\Push;

use App\Tasks\Occurrence;

/**
 * One notification the scheduler owes a user: the morning one, for every pending occurrence of the day without a time,
 * or a reminder for one timed occurrence.
 */
final readonly class DueNotification
{
    /**
     * Morning rows in `sent_notifications` are once per user and day, whatever tasks they cover.
     */
    public const string MORNING_OCCURRENCE_KEY = 'day';

    /**
     * Push services take about 4 KB of encrypted payload; task texts can be longer. A morning body lists the tasks,
     * each cut to {@see MAX_LISTED_TASK_LENGTH} and all of them to {@see MAX_BODY_LENGTH}.
     */
    private const int MAX_TITLE_LENGTH = 120;

    private const int MAX_LISTED_TASK_LENGTH = 60;

    private const int MAX_BODY_LENGTH = 400;

    /**
     * @param  non-empty-list<Occurrence>  $occurrences  One for a reminder; one or more for the morning.
     * @param  string  $date  The local date it is for ('YYYY-MM-DD'): the morning's day, or the occurrence's.
     */
    private function __construct(
        public NotificationKind $kind,
        public array $occurrences,
        public string $date,
    ) {}

    /**
     * @param  non-empty-list<Occurrence>  $occurrences
     */
    public static function morning(string $date, array $occurrences): self
    {
        return new self(NotificationKind::Morning, $occurrences, $date);
    }

    public static function reminder(Occurrence $occurrence): self
    {
        return new self(NotificationKind::Reminder, [$occurrence], $occurrence->date);
    }

    /**
     * What identifies it across runs. The morning one is one per day. A reminder names its occurrence by
     * `(seriesId, occurrenceDate)` when it belongs to a series (its id changes once it is edited or moved), else by
     * task id.
     */
    public function occurrenceKey(): string
    {
        if ($this->kind === NotificationKind::Morning) {
            return self::MORNING_OCCURRENCE_KEY;
        }

        $occurrence = $this->occurrences[0];

        return $occurrence->seriesId !== null && $occurrence->occurrenceDate !== null
            ? Occurrence::idFor($occurrence->seriesId, $occurrence->occurrenceDate)
            : $occurrence->id;
    }

    public function message(): PushMessage
    {
        return match ($this->kind) {
            NotificationKind::Morning => $this->morningMessage(),
            NotificationKind::Reminder => $this->reminderMessage(),
        };
    }

    /**
     * One task: that task, like a reminder. Several: how many, listed, opening the planner.
     */
    private function morningMessage(): PushMessage
    {
        $count = count($this->occurrences);
        $first = $this->occurrences[0];
        $titles = array_map(
            fn (Occurrence $occurrence) => self::cut($occurrence->text, self::MAX_LISTED_TASK_LENGTH),
            $this->occurrences,
        );

        return new PushMessage(
            title: $count === 1 ? self::cut($first->text, self::MAX_TITLE_LENGTH) : __(':count tasks today', ['count' => $count]),
            body: $count === 1 ? __('Today') : self::cut(implode(' · ', $titles), self::MAX_BODY_LENGTH),
            url: $count === 1 ? self::taskUrl($first) : '/',
            tag: "morning:{$this->date}",
            ttl: $this->kind->ttlSeconds(),
        );
    }

    private function reminderMessage(): PushMessage
    {
        $occurrence = $this->occurrences[0];

        return new PushMessage(
            title: self::cut($occurrence->text, self::MAX_TITLE_LENGTH),
            body: __('In :minutes minutes · :time', ['minutes' => DueNotifications::REMINDER_LEAD_MINUTES, 'time' => $occurrence->time]),
            url: self::taskUrl($occurrence),
            tag: "reminder:{$occurrence->id}:{$this->date}",
            ttl: $this->kind->ttlSeconds(),
        );
    }

    private static function taskUrl(Occurrence $occurrence): string
    {
        return '/?task='.rawurlencode($occurrence->id);
    }

    private static function cut(string $text, int $length): string
    {
        return mb_strimwidth($text, 0, $length, '…');
    }
}
