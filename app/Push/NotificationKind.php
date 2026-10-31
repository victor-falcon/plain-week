<?php

namespace App\Push;

enum NotificationKind: string
{
    /** One per day at the user's morning time, covering every pending task of the day without a time. */
    case Morning = 'morning';

    /** Five minutes before a timed task. */
    case Reminder = 'reminder';

    /**
     * How long a push service may keep the message for an offline or dozing device. A morning summary is still useful
     * hours later; a reminder is worthless once its task has started.
     */
    public function ttlSeconds(): int
    {
        return match ($this) {
            self::Morning => 4 * 3600,
            self::Reminder => 3600,
        };
    }
}
