<?php

namespace App\Http\Controllers\Settings;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class IntegrationsController extends Controller
{
    /**
     * Settings › Integrations: the Google Calendar connection, if any, and the ICS feed.
     */
    public function edit(Request $request): Response
    {
        /** @var User $user */
        $user = $request->user();
        $connection = $user->googleCalendarConnection;
        $feed = $user->icsFeed;

        return Inertia::render('settings/integrations', [
            'googleCalendar' => $connection === null ? null : [
                'email' => $connection->google_email,
                'broken' => $connection->isBroken(),
                'lastSyncedAt' => $connection->last_synced_at?->toIso8601String(),
                'lastError' => $connection->isBroken() ? null : $connection->last_error,
            ],
            // Null when off, and when APP_KEY changed since it was made: enabling it again makes a new URL.
            'icsFeed' => ($url = $feed?->urlIfReadable()) === null ? null : ['url' => $url],
            // Enabling it (or a new URL) needs a plan in SaaS mode; turning it off never does.
            'canEnableIcsFeed' => $user->hasAccess(),
        ]);
    }
}
