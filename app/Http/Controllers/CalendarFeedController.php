<?php

namespace App\Http\Controllers;

use App\Integrations\IcsFeed\IcsCalendar;
use App\Models\IcsFeed;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * `GET /calendar/{token}.ics`: the ICS subscription feed. Calendar apps fetch it with no session or cookies, so the
 * secret token in the URL is the only credential.
 */
class CalendarFeedController extends Controller
{
    public function __invoke(Request $request, string $token, IcsCalendar $calendar): Response
    {
        $feed = IcsFeed::findByToken($token) ?? abort(404);

        if (! $feed->user->hasAccess()) {
            abort(402, 'A paid plan is required for the calendar feed.');
        }

        $body = $calendar($feed->user);

        $response = response($body, 200, [
            'Content-Type' => 'text/calendar; charset=utf-8',
            'Content-Disposition' => 'inline; filename="plain-week.ics"',
            'Cache-Control' => 'private, no-cache',
        ]);

        // DTSTAMP is the time of the request, so it is left out of the ETag: an unchanged planner answers 304.
        $response->setEtag(hash('sha256', (string) preg_replace('/^DTSTAMP:.*\r\n/m', '', $body)));
        $response->isNotModified($request);

        return $response;
    }
}
