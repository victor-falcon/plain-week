<?php

namespace App\Http\Controllers\Settings;

use App\Http\Controllers\Controller;
use App\Integrations\GoogleCalendar\ConnectGoogleCalendar;
use App\Integrations\GoogleCalendar\DisconnectGoogleCalendar;
use App\Integrations\GoogleCalendar\GoogleCalendarDisconnected;
use App\Integrations\GoogleCalendar\GoogleOAuth;
use App\Models\User;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\RequestException;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Inertia\Inertia;
use Inertia\Response;
use Symfony\Component\HttpFoundation\Response as HttpResponse;

class GoogleCalendarController extends Controller
{
    private const string SESSION_KEY = 'google_calendar_oauth';

    /**
     * Settings › Integrations: the Google Calendar connection, if any.
     */
    public function edit(Request $request): Response
    {
        $connection = $this->user($request)->googleCalendarConnection;

        return Inertia::render('settings/integrations', [
            'googleCalendar' => $connection === null ? null : [
                'email' => $connection->google_email,
                'broken' => $connection->isBroken(),
            ],
        ]);
    }

    /**
     * Sends the user to Google's consent screen.
     */
    public function connect(Request $request, GoogleOAuth $oauth): HttpResponse
    {
        $state = Str::random(40);
        $codeVerifier = $oauth->newCodeVerifier();

        $request->session()->put(self::SESSION_KEY, ['state' => $state, 'code_verifier' => $codeVerifier]);

        return Inertia::location($oauth->authorizationUrl($state, $codeVerifier));
    }

    /**
     * Google sends the user back here with a code (or an error).
     */
    public function callback(Request $request, GoogleOAuth $oauth, ConnectGoogleCalendar $connect): RedirectResponse
    {
        /** @var array{state?: string, code_verifier?: string} $pending */
        $pending = $request->session()->pull(self::SESSION_KEY, []);
        $state = $request->query('state');
        $code = $request->query('code');

        if (! isset($pending['state'], $pending['code_verifier']) || ! is_string($state) || ! hash_equals($pending['state'], $state)) {
            return $this->failed(__('The Google sign-in expired. Please try again.'));
        }

        // The user pressed Cancel on the consent screen.
        if ($request->query('error') === 'access_denied') {
            return to_route('integrations.edit');
        }

        if (! is_string($code) || $code === '') {
            return $this->failed(__('Google did not connect. Please try again.'));
        }

        try {
            $tokens = $oauth->exchangeCode($code, $pending['code_verifier']);

            // Google lets the user untick the calendar permission on the consent screen.
            if (! $tokens->grants(GoogleOAuth::CALENDAR_SCOPE) || $tokens->refreshToken === null) {
                return $this->failed(__('Plain Week needs permission to manage its own calendar. Please connect again and allow it.'));
            }

            $connect($this->user($request), $tokens);
        } catch (RequestException|ConnectionException|GoogleCalendarDisconnected $e) {
            report($e);

            return $this->failed(__('Google did not connect. Please try again.'));
        }

        Inertia::flash('toast', ['type' => 'success', 'message' => __('Google Calendar connected.')]);

        return to_route('integrations.edit');
    }

    /**
     * Disconnects Google Calendar and deletes the "Plain Week" calendar.
     */
    public function destroy(Request $request, DisconnectGoogleCalendar $disconnect): RedirectResponse
    {
        $connection = $this->user($request)->googleCalendarConnection;

        if ($connection !== null) {
            $disconnect($connection);
        }

        Inertia::flash('toast', ['type' => 'success', 'message' => __('Google Calendar disconnected.')]);

        return to_route('integrations.edit');
    }

    private function failed(string $message): RedirectResponse
    {
        Inertia::flash('toast', ['type' => 'error', 'message' => $message]);

        return to_route('integrations.edit');
    }

    private function user(Request $request): User
    {
        /** @var User */
        return $request->user();
    }
}
