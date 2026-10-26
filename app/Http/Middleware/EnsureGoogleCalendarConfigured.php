<?php

namespace App\Http\Middleware;

use App\Integrations\GoogleCalendar\GoogleOAuth;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * The Google Calendar integration exists only when the instance has OAuth
 * credentials (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`); elsewhere its
 * routes are 404.
 */
class EnsureGoogleCalendarConfigured
{
    /**
     * @param  Closure(Request): Response  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        abort_unless(GoogleOAuth::configured(), 404);

        return $next($request);
    }
}
