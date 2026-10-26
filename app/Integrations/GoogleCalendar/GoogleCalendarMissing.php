<?php

namespace App\Integrations\GoogleCalendar;

use RuntimeException;

/**
 * The connection's "Plain Week" calendar no longer exists (the user deleted it in Google). Nothing can sync until the
 * user reconnects, which creates a new one.
 */
class GoogleCalendarMissing extends RuntimeException {}
