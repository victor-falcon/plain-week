<?php

namespace App\Push;

enum NotificationKind: string
{
    /** One per pending task of the day, at the user's morning time. */
    case Morning = 'morning';

    /** Five minutes before a timed task. */
    case Reminder = 'reminder';
}
