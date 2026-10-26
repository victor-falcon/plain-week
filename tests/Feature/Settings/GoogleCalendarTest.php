<?php

use App\Integrations\GoogleCalendar\GoogleCalendarClient;
use App\Integrations\GoogleCalendar\GoogleCalendarDisconnected;
use App\Integrations\GoogleCalendar\GoogleOAuth;
use App\Jobs\SyncGoogleCalendar;
use App\Models\GoogleCalendarConnection;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use Inertia\Testing\AssertableInertia as Assert;

uses(RefreshDatabase::class);

beforeEach(function () {
    config(['services.google.client_id' => 'client-id', 'services.google.client_secret' => 'client-secret']);
    Http::preventStrayRequests();
});

/**
 * An ID token as Google's token endpoint returns it (only the payload matters here).
 */
function googleIdToken(string $email): string
{
    $encode = fn (array $data) => rtrim(strtr(base64_encode((string) json_encode($data)), '+/', '-_'), '=');

    return $encode(['alg' => 'RS256']).'.'.$encode(['email' => $email, 'sub' => '123']).'.signature';
}

/**
 * @param  array<string, mixed>  $overrides
 * @return array<string, mixed>
 */
function googleTokenResponse(array $overrides = []): array
{
    return array_merge([
        'access_token' => 'access-1',
        'refresh_token' => 'refresh-1',
        'expires_in' => 3599,
        'scope' => 'openid https://www.googleapis.com/auth/userinfo.email '.GoogleOAuth::CALENDAR_SCOPE,
        'token_type' => 'Bearer',
        'id_token' => googleIdToken('me@gmail.com'),
    ], $overrides);
}

/**
 * Starts the OAuth flow and returns the state Google would send back.
 */
function startGoogleConnect(User $user): string
{
    $location = test()->actingAs($user)
        ->get(route('integrations.google.connect'))
        ->assertRedirect()
        ->headers->get('Location');

    parse_str((string) parse_url((string) $location, PHP_URL_QUERY), $query);

    return (string) $query['state'];
}

/**
 * @param  array<string, mixed>  $overrides
 */
function googleConnection(User $user, array $overrides = []): GoogleCalendarConnection
{
    return $user->googleCalendarConnection()->create(array_merge([
        'google_email' => 'me@gmail.com',
        'access_token' => 'access-1',
        'refresh_token' => 'refresh-1',
        'token_expires_at' => now()->addHour(),
        'calendar_id' => 'cal-1@group.calendar.google.com',
        'connected_at' => now(),
    ], $overrides));
}

describe('when Google is not configured', function () {
    beforeEach(fn () => config(['services.google.client_id' => null]));

    test('the routes are 404', function () {
        $user = User::factory()->create();
        googleConnection($user);

        $this->actingAs($user)->get(route('integrations.edit'))->assertNotFound();
        $this->actingAs($user)->get(route('integrations.google.connect'))->assertNotFound();
        $this->actingAs($user)->get(route('integrations.google.callback'))->assertNotFound();
        $this->actingAs($user)->delete(route('integrations.google.destroy'))->assertNotFound();
    });

    test('the integration is not offered to the pages', function () {
        $this->actingAs(User::factory()->create())
            ->get(route('profile.edit'))
            ->assertInertia(fn (Assert $page) => $page->where('integrations.googleCalendar', false));
    });
});

test('the integration is offered to the pages when configured', function () {
    $this->actingAs(User::factory()->create())
        ->get(route('profile.edit'))
        ->assertInertia(fn (Assert $page) => $page->where('integrations.googleCalendar', true));
});

test('guests are redirected to the login page', function () {
    $this->get(route('integrations.edit'))->assertRedirect(route('login'));
    $this->get(route('integrations.google.connect'))->assertRedirect(route('login'));
});

test('in SaaS mode connecting needs a plan, but the page and disconnecting do not', function () {
    config(['saas.enabled' => true]);
    $user = User::factory()->create();
    googleConnection($user, ['disconnected_reason' => 'invalid_grant']);

    $this->actingAs($user)->get(route('integrations.google.connect'))->assertRedirect(route('billing.plans'));
    $this->actingAs($user)->get(route('integrations.google.callback'))->assertRedirect(route('billing.plans'));
    $this->actingAs($user)->get(route('integrations.edit'))->assertOk();
    $this->actingAs($user)->delete(route('integrations.google.destroy'))->assertRedirect(route('integrations.edit'));

    expect($user->googleCalendarConnection()->exists())->toBeFalse();
});

test('the page shows that nothing is connected', function () {
    $this->actingAs(User::factory()->create())
        ->get(route('integrations.edit'))
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->component('settings/integrations')
            ->where('googleCalendar', null));
});

test('the page shows the connected account and whether it is broken', function () {
    $user = User::factory()->create();
    googleConnection($user, ['disconnected_reason' => 'invalid_grant']);

    $this->actingAs($user)
        ->get(route('integrations.edit'))
        ->assertInertia(fn (Assert $page) => $page
            ->where('googleCalendar.email', 'me@gmail.com')
            ->where('googleCalendar.broken', true));
});

test('connect sends the user to Google with offline access and the app-created calendar scope', function () {
    $location = $this->actingAs(User::factory()->create())
        ->get(route('integrations.google.connect'))
        ->assertRedirect()
        ->headers->get('Location');

    expect($location)->toStartWith('https://accounts.google.com/o/oauth2/v2/auth?');

    parse_str((string) parse_url((string) $location, PHP_URL_QUERY), $query);

    expect($query)
        ->client_id->toBe('client-id')
        ->redirect_uri->toBe(route('integrations.google.callback'))
        ->scope->toBe('openid email '.GoogleOAuth::CALENDAR_SCOPE)
        ->access_type->toBe('offline')
        ->prompt->toBe('consent')
        ->code_challenge_method->toBe('S256')
        ->and($query['state'])->toHaveLength(40);
});

test('the callback stores the connection and creates the Plain Week calendar', function () {
    Http::fake([
        'oauth2.googleapis.com/token' => Http::response(googleTokenResponse()),
        'www.googleapis.com/calendar/v3/calendars' => Http::response(['id' => 'new-cal@group.calendar.google.com']),
    ]);
    $user = User::factory()->create();
    $state = startGoogleConnect($user);

    $this->get(route('integrations.google.callback', ['state' => $state, 'code' => 'auth-code']))
        ->assertRedirect(route('integrations.edit'));

    $connection = $user->googleCalendarConnection()->sole();
    expect($connection)
        ->google_email->toBe('me@gmail.com')
        ->access_token->toBe('access-1')
        ->refresh_token->toBe('refresh-1')
        ->calendar_id->toBe('new-cal@group.calendar.google.com')
        ->isBroken()->toBeFalse();

    // Tokens are encrypted at rest.
    $row = DB::table('google_calendar_connections')->first();
    expect($row->refresh_token)->not->toContain('refresh-1');

    Http::assertSent(fn (Request $request) => $request->url() === 'https://oauth2.googleapis.com/token'
        && $request['grant_type'] === 'authorization_code'
        && $request['code'] === 'auth-code'
        && is_string($request['code_verifier']));
    Http::assertSent(fn (Request $request) => $request->url() === 'https://www.googleapis.com/calendar/v3/calendars'
        && $request->hasHeader('Authorization', 'Bearer access-1')
        && $request['summary'] === 'Plain Week'
        && $request['timeZone'] === config('app.timezone'));
});

test('the calendar uses the time zone stored on the account', function () {
    Http::fake([
        'oauth2.googleapis.com/token' => Http::response(googleTokenResponse()),
        'www.googleapis.com/calendar/v3/calendars' => Http::response(['id' => 'new-cal']),
    ]);
    $user = User::factory()->create();
    $user->forceFill(['timezone' => 'Europe/Madrid'])->save();

    $this->get(route('integrations.google.callback', ['state' => startGoogleConnect($user), 'code' => 'auth-code']));

    Http::assertSent(fn (Request $request) => $request->url() === 'https://www.googleapis.com/calendar/v3/calendars'
        && $request['timeZone'] === 'Europe/Madrid');
});

test('a reconnect keeps the calendar when it still exists', function () {
    Http::fake([
        'oauth2.googleapis.com/token' => Http::response(googleTokenResponse(['access_token' => 'access-2', 'refresh_token' => 'refresh-2'])),
        'www.googleapis.com/calendar/v3/calendars/*' => Http::response(['id' => 'cal-1@group.calendar.google.com']),
    ]);
    $user = User::factory()->create();
    googleConnection($user, ['disconnected_reason' => 'invalid_grant', 'last_error' => 'Token has been expired or revoked.']);

    $this->get(route('integrations.google.callback', ['state' => startGoogleConnect($user), 'code' => 'auth-code']));

    expect($user->googleCalendarConnection()->sole())
        ->calendar_id->toBe('cal-1@group.calendar.google.com')
        ->refresh_token->toBe('refresh-2')
        ->disconnected_reason->toBeNull()
        ->last_error->toBeNull();
    Http::assertSent(fn (Request $request) => $request->method() === 'GET'
        && $request->url() === 'https://www.googleapis.com/calendar/v3/calendars/cal-1%40group.calendar.google.com');
    Http::assertNotSent(fn (Request $request) => $request->method() === 'POST' && str_contains($request->url(), '/calendar/'));
});

test('a reconnect creates a new calendar when the old one is gone', function () {
    Http::fake([
        'oauth2.googleapis.com/token' => Http::response(googleTokenResponse()),
        'www.googleapis.com/calendar/v3/calendars/*' => Http::response(['error' => ['code' => 404]], 404),
        'www.googleapis.com/calendar/v3/calendars' => Http::response(['id' => 'cal-2']),
    ]);
    $user = User::factory()->create();
    googleConnection($user, ['disconnected_reason' => 'invalid_grant']);

    $this->get(route('integrations.google.callback', ['state' => startGoogleConnect($user), 'code' => 'auth-code']));

    expect($user->googleCalendarConnection()->sole()->calendar_id)->toBe('cal-2');
});

test('a reconnect to a new calendar forgets the events sent to the old one and syncs again', function () {
    Queue::fake();
    Http::fake([
        'oauth2.googleapis.com/token' => Http::response(googleTokenResponse()),
        'www.googleapis.com/calendar/v3/calendars/*' => Http::response(['error' => ['code' => 404]], 404),
        'www.googleapis.com/calendar/v3/calendars' => Http::response(['id' => 'cal-2']),
    ]);
    $user = User::factory()->create();
    googleConnection($user, ['disconnected_reason' => 'invalid_grant'])
        ->events()->create(['key' => 'task-1', 'google_event_id' => 'event-1', 'date' => '2026-10-27', 'payload_hash' => 'hash']);

    $this->get(route('integrations.google.callback', ['state' => startGoogleConnect($user), 'code' => 'auth-code']));

    expect($user->googleCalendarConnection()->sole()->events()->count())->toBe(0);
    Queue::assertPushed(SyncGoogleCalendar::class, fn (SyncGoogleCalendar $job) => $job->userId === $user->id);
});

test('a reconnect that keeps the calendar keeps its events', function () {
    Queue::fake();
    Http::fake([
        'oauth2.googleapis.com/token' => Http::response(googleTokenResponse()),
        'www.googleapis.com/calendar/v3/calendars/*' => Http::response(['id' => 'cal-1@group.calendar.google.com']),
    ]);
    $user = User::factory()->create();
    googleConnection($user, ['disconnected_reason' => 'invalid_grant'])
        ->events()->create(['key' => 'task-1', 'google_event_id' => 'event-1', 'date' => '2026-10-27', 'payload_hash' => 'hash']);

    $this->get(route('integrations.google.callback', ['state' => startGoogleConnect($user), 'code' => 'auth-code']));

    expect($user->googleCalendarConnection()->sole()->events()->count())->toBe(1);
});

test('a rate-limited reconnect does not create a second calendar', function () {
    Http::fake([
        'oauth2.googleapis.com/token' => Http::response(googleTokenResponse()),
        'oauth2.googleapis.com/revoke' => Http::response(),
        'www.googleapis.com/calendar/v3/calendars/*' => Http::response(['error' => ['code' => 403, 'errors' => [['reason' => 'rateLimitExceeded']]]], 403),
        'www.googleapis.com/calendar/v3/calendars' => Http::response(['id' => 'cal-2']),
    ]);
    $user = User::factory()->create();
    googleConnection($user, ['disconnected_reason' => 'invalid_grant']);

    $this->get(route('integrations.google.callback', ['state' => startGoogleConnect($user), 'code' => 'auth-code']))
        ->assertInertiaFlash('toast.type', 'error');

    expect($user->googleCalendarConnection()->sole())
        ->calendar_id->toBe('cal-1@group.calendar.google.com')
        ->isBroken()->toBeTrue();
    Http::assertNotSent(fn (Request $request) => $request->method() === 'POST' && str_contains($request->url(), '/calendar/'));
});

test('connecting another Google account cleans up the previous one', function () {
    Http::fake([
        'oauth2.googleapis.com/token' => Http::response(googleTokenResponse(['access_token' => 'access-2', 'refresh_token' => 'refresh-2', 'id_token' => googleIdToken('other@gmail.com')])),
        'oauth2.googleapis.com/revoke' => Http::response(),
        'www.googleapis.com/calendar/v3/calendars/*' => Http::response(null, 204),
        'www.googleapis.com/calendar/v3/calendars' => Http::response(['id' => 'cal-2']),
    ]);
    $user = User::factory()->create();
    googleConnection($user);

    $this->get(route('integrations.google.callback', ['state' => startGoogleConnect($user), 'code' => 'auth-code']));

    expect($user->googleCalendarConnection()->sole())
        ->google_email->toBe('other@gmail.com')
        ->calendar_id->toBe('cal-2');
    Http::assertSent(fn (Request $request) => $request->method() === 'DELETE'
        && $request->hasHeader('Authorization', 'Bearer access-1'));
    Http::assertSent(fn (Request $request) => $request->url() === 'https://oauth2.googleapis.com/revoke'
        && $request['token'] === 'refresh-1');
});

test('the callback refuses a state that does not match', function () {
    $user = User::factory()->create();
    startGoogleConnect($user);

    $this->get(route('integrations.google.callback', ['state' => 'forged', 'code' => 'auth-code']))
        ->assertRedirect(route('integrations.edit'))
        ->assertInertiaFlash('toast.type', 'error');

    expect($user->googleCalendarConnection()->exists())->toBeFalse();
});

test('a cancelled consent screen changes nothing', function () {
    $user = User::factory()->create();

    $this->get(route('integrations.google.callback', ['state' => startGoogleConnect($user), 'error' => 'access_denied']))
        ->assertRedirect(route('integrations.edit'))
        ->assertInertiaFlashMissing('toast');

    expect($user->googleCalendarConnection()->exists())->toBeFalse();
});

test('the callback refuses and gives back a grant without the calendar permission or the email', function (array $response) {
    Http::fake([
        'oauth2.googleapis.com/token' => Http::response(googleTokenResponse($response)),
        'oauth2.googleapis.com/revoke' => Http::response(),
    ]);
    $user = User::factory()->create();

    $this->get(route('integrations.google.callback', ['state' => startGoogleConnect($user), 'code' => 'auth-code']))
        ->assertInertiaFlash('toast.type', 'error');

    expect($user->googleCalendarConnection()->exists())->toBeFalse();
    Http::assertSent(fn (Request $request) => $request->url() === 'https://oauth2.googleapis.com/revoke'
        && $request['token'] === 'refresh-1');
})->with([
    'no calendar scope' => [['scope' => 'openid email']],
    'no email' => [['id_token' => null]],
]);

test('a failing Google leaves no connection behind', function () {
    Http::fake([
        'oauth2.googleapis.com/token' => Http::response(googleTokenResponse()),
        'oauth2.googleapis.com/revoke' => Http::response(),
        'www.googleapis.com/calendar/v3/calendars' => Http::response([], 503),
    ]);
    $user = User::factory()->create();

    $this->get(route('integrations.google.callback', ['state' => startGoogleConnect($user), 'code' => 'auth-code']))
        ->assertInertiaFlash('toast.type', 'error');

    expect($user->googleCalendarConnection()->exists())->toBeFalse();
});

test('disconnect deletes the calendar, revokes the grant and forgets the connection', function () {
    Http::fake([
        'www.googleapis.com/calendar/v3/calendars/*' => Http::response(null, 204),
        'oauth2.googleapis.com/revoke' => Http::response(),
    ]);
    $user = User::factory()->create();
    googleConnection($user);

    $this->actingAs($user)
        ->delete(route('integrations.google.destroy'))
        ->assertRedirect(route('integrations.edit'));

    expect($user->googleCalendarConnection()->exists())->toBeFalse();
    Http::assertSent(fn (Request $request) => $request->method() === 'DELETE'
        && $request->url() === 'https://www.googleapis.com/calendar/v3/calendars/cal-1%40group.calendar.google.com');
    Http::assertSent(fn (Request $request) => $request->url() === 'https://oauth2.googleapis.com/revoke'
        && $request['token'] === 'refresh-1');
});

test('disconnect keeps the connection when Google cannot delete the calendar', function () {
    Http::fake(['www.googleapis.com/calendar/v3/calendars/*' => Http::response([], 503)]);
    $user = User::factory()->create();
    googleConnection($user);

    $this->actingAs($user)
        ->delete(route('integrations.google.destroy'))
        ->assertRedirect(route('integrations.edit'))
        ->assertInertiaFlash('toast.type', 'error');

    expect($user->googleCalendarConnection()->exists())->toBeTrue();
    Http::assertNotSent(fn (Request $request) => str_contains($request->url(), '/revoke'));
});

test('disconnect forgets the connection when only the revoke fails', function () {
    Http::fake([
        'www.googleapis.com/calendar/v3/calendars/*' => Http::response(null, 204),
        'oauth2.googleapis.com/revoke' => Http::response([], 503),
    ]);
    $user = User::factory()->create();
    googleConnection($user);

    $this->actingAs($user)
        ->delete(route('integrations.google.destroy'))
        ->assertInertiaFlash('toast.type', 'success');

    expect($user->googleCalendarConnection()->exists())->toBeFalse();
});

test('disconnecting a broken connection does not call Google', function () {
    $user = User::factory()->create();
    googleConnection($user, ['disconnected_reason' => 'invalid_grant']);

    $this->actingAs($user)->delete(route('integrations.google.destroy'));

    expect($user->googleCalendarConnection()->exists())->toBeFalse();
    Http::assertNothingSent();
});

test('deleting the account disconnects Google Calendar', function () {
    Http::fake([
        'www.googleapis.com/calendar/v3/calendars/*' => Http::response(null, 204),
        'oauth2.googleapis.com/revoke' => Http::response(),
    ]);
    $user = User::factory()->create();
    googleConnection($user);

    $this->actingAs($user)
        ->delete(route('profile.destroy'), ['password' => 'password'])
        ->assertRedirect('/');

    expect(GoogleCalendarConnection::count())->toBe(0);
    Http::assertSent(fn (Request $request) => $request->method() === 'DELETE');
    Http::assertSent(fn (Request $request) => $request->url() === 'https://oauth2.googleapis.com/revoke');
});

test('the account is deleted even when Google is down', function () {
    Http::fake(['*' => Http::response([], 503)]);
    $user = User::factory()->create();
    googleConnection($user);

    $this->actingAs($user)->delete(route('profile.destroy'), ['password' => 'password'])->assertRedirect('/');

    expect(User::count())->toBe(0)->and(GoogleCalendarConnection::count())->toBe(0);
});

test('the client refreshes an expired access token', function () {
    Http::fake([
        'oauth2.googleapis.com/token' => Http::response(googleTokenResponse(['access_token' => 'access-2', 'refresh_token' => null, 'id_token' => null])),
        'www.googleapis.com/calendar/v3/calendars' => Http::response(['id' => 'cal-2']),
    ]);
    $connection = googleConnection(User::factory()->create(), ['token_expires_at' => now()->subMinute()]);

    app(GoogleCalendarClient::class)->createCalendar($connection, 'Plain Week', 'UTC');

    expect($connection->fresh())
        ->access_token->toBe('access-2')
        ->refresh_token->toBe('refresh-1')
        ->token_expires_at->isFuture()->toBeTrue();
    Http::assertSent(fn (Request $request) => $request->url() === 'https://oauth2.googleapis.com/token'
        && $request['grant_type'] === 'refresh_token'
        && $request['refresh_token'] === 'refresh-1');
    Http::assertSent(fn (Request $request) => str_contains($request->url(), '/calendar/')
        && $request->hasHeader('Authorization', 'Bearer access-2'));
});

test('a refused refresh token marks the connection broken', function () {
    Http::fake([
        'oauth2.googleapis.com/token' => Http::response(['error' => 'invalid_grant', 'error_description' => 'Token has been expired or revoked.'], 400),
    ]);
    $connection = googleConnection(User::factory()->create(), ['token_expires_at' => now()->subMinute()]);

    expect(fn () => app(GoogleCalendarClient::class)->createCalendar($connection, 'Plain Week', 'UTC'))
        ->toThrow(GoogleCalendarDisconnected::class);

    expect($connection->fresh())
        ->isBroken()->toBeTrue()
        ->last_error->toBe('Token has been expired or revoked.');
    Http::assertNotSent(fn (Request $request) => str_contains($request->url(), '/calendar/'));
});
