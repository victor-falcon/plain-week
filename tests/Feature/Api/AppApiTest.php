<?php

use App\Actions\Sync\SyncFormat;
use App\Models\Task;
use App\Models\User;
use App\Providers\AppServiceProvider;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Date;
use Illuminate\Support\Str;
use Illuminate\Testing\TestResponse;
use Inertia\Testing\AssertableInertia as Assert;
use Laravel\Passport\Passport;

uses(RefreshDatabase::class);

beforeEach(function () {
    usePassportKeys();
});

const APP_CALLBACK = 'plainweek://oauth/callback';

/**
 * Bearer headers for the app API, with the sync format header the web client sends.
 *
 * @return array<string, string>
 */
function apiAuth(string $token, ?SyncFormat $format = SyncFormat::DailyRules): array
{
    // Each request authenticates on its own, like separate app requests: the guard must not keep the last user.
    app('auth')->forgetGuards();

    $headers = ['Authorization' => "Bearer {$token}"];

    if ($format !== null) {
        $headers[SyncFormat::HEADER] = (string) $format->value;
    }

    return $headers;
}

/**
 * The OAuth flow a native app goes through: it registers itself with its `plainweek://` redirect, the user approves
 * it on the consent card and the app exchanges the code with its PKCE verifier. Returns the access token.
 */
function appOAuthToken(User $user): string
{
    $clientId = test()->postJson('/oauth/register', [
        'client_name' => 'Plain Week for Mac',
        'redirect_uris' => [APP_CALLBACK],
        'grant_types' => ['authorization_code', 'refresh_token'],
        'token_endpoint_auth_method' => 'none',
    ])->assertCreated()->json('client_id');

    $verifier = Str::random(64);
    $query = [
        'response_type' => 'code',
        'client_id' => $clientId,
        'redirect_uri' => APP_CALLBACK,
        'state' => 'app-state',
        'scope' => 'mcp:use',
        'code_challenge' => rtrim(strtr(base64_encode(hash('sha256', $verifier, true)), '+/', '-_'), '='),
        'code_challenge_method' => 'S256',
    ];

    $authToken = null;
    test()->actingAs($user)
        ->get('/oauth/authorize?'.http_build_query($query))
        ->assertOk()
        ->assertInertia(function (Assert $page) use (&$authToken) {
            $page->component('oauth/authorize')->where('redirectHost', 'plainweek://oauth');
            $authToken = $page->toArray()['props']['authToken'];
        });

    $location = (string) test()->post('/oauth/authorize', [
        'state' => 'app-state',
        'client_id' => $clientId,
        'auth_token' => $authToken,
    ])->assertRedirect()->headers->get('Location');

    expect($location)->toStartWith(APP_CALLBACK.'?');
    parse_str((string) parse_url($location, PHP_URL_QUERY), $callback);

    // The app talks to the API without the browser's session.
    app('auth')->forgetGuards();
    test()->flushSession();

    return test()->postJson('/oauth/token', [
        'grant_type' => 'authorization_code',
        'client_id' => $clientId,
        'redirect_uri' => APP_CALLBACK,
        'code_verifier' => $verifier,
        'code' => $callback['code'],
    ])->assertOk()->json('access_token');
}

/**
 * A token for the user of the kind the `tokens` dataset names.
 */
function appToken(string $kind, User $user): string
{
    return $kind === 'oauth' ? appOAuthToken($user) : personalToken($user, 'Desktop');
}

dataset('tokens', [
    'a personal token' => ['personal'],
    'an OAuth token' => ['oauth'],
]);

test('/me returns the account and its entitlement', function (string $kind) {
    $user = User::factory()->create(['name' => 'Ada', 'email' => 'ada@example.com']);
    $token = appToken($kind, $user);

    $this->getJson(route('api.me'), apiAuth($token))
        ->assertOk()
        ->assertJsonPath('user.id', $user->id)
        ->assertJsonPath('user.email', 'ada@example.com')
        ->assertJsonMissingPath('user.password')
        ->assertJsonPath('account', ['hasAccess' => true, 'plan' => null]);
})->with('tokens');

test('push and pull work with a token, unchanged from the web sync', function (string $kind) {
    $user = User::factory()->create();
    $token = appToken($kind, $user);
    $task = wireTask();

    $this->postJson(route('api.sync.push'), ['tasks' => [$task]], apiAuth($token))
        ->assertOk()
        ->assertExactJson(['applied' => [$task['id']], 'rejected' => [], 'cursor' => 1]);

    $this->getJson(route('api.sync.pull'), apiAuth($token))
        ->assertOk()
        ->assertExactJson(['tasks' => [$task], 'cursor' => 1, 'has_more' => false]);

    expect(Task::find($task['id'])->user_id)->toBe($user->id);
})->with('tokens');

test('an API call records when the token was last used', function () {
    Date::setTestNow('2026-11-20 10:00:00');
    $user = User::factory()->create();
    $token = personalToken($user);

    $this->getJson(route('api.sync.pull'), apiAuth($token))->assertOk();

    expect($user->tokens()->sole()->getAttribute('last_used_at'))->not->toBeNull();
});

test('empty notes and leading spaces round-trip byte for byte', function () {
    $token = personalToken(User::factory()->create());
    $task = wireTask(['text' => '  Buy milk ', 'notes' => '']);

    $this->postJson(route('api.sync.push'), ['tasks' => [$task]], apiAuth($token))
        ->assertOk()
        ->assertJsonPath('applied', [$task['id']]);

    $this->getJson(route('api.sync.pull'), apiAuth($token))
        ->assertJsonPath('tasks.0.text', '  Buy milk ')
        ->assertJsonPath('tasks.0.notes', '');
});

test('the API sync is isolated per token owner', function () {
    $ada = personalToken(User::factory()->create());
    $bob = personalToken(User::factory()->create());
    $task = wireTask();

    $this->postJson(route('api.sync.push'), ['tasks' => [$task]], apiAuth($ada))->assertOk();

    $this->getJson(route('api.sync.pull'), apiAuth($bob))
        ->assertExactJson(['tasks' => [], 'cursor' => 0, 'has_more' => false]);

    $this->postJson(route('api.sync.push'), ['tasks' => [[...$task, 'text' => 'Hijacked']]], apiAuth($bob))
        ->assertExactJson(['applied' => [], 'rejected' => [$task['id']], 'cursor' => 0]);

    expect(Task::find($task['id'])->text)->toBe('Buy milk');
});

test('the X-Timezone header is stored on the user, like on the web sync', function () {
    $user = User::factory()->create();
    $token = personalToken($user);

    $this->getJson(route('api.sync.pull'), [...apiAuth($token), 'X-Timezone' => 'Europe/Madrid'])->assertOk();

    expect($user->fresh()->timezone)->toBe('Europe/Madrid');
});

test('without a valid token the API answers 401 with the resource metadata', function (string $method, string $route, ?string $token) {
    $headers = $token === null ? [] : ['Authorization' => "Bearer {$token}"];

    $this->json($method, route($route), [], $headers)
        ->assertUnauthorized()
        ->assertHeader('WWW-Authenticate', 'Bearer realm="plain-week", resource_metadata="'.url('/.well-known/oauth-protected-resource/api/v1').'"');
})->with([
    ['GET', 'api.me'],
    ['POST', 'api.sync.push'],
    ['GET', 'api.sync.pull'],
])->with([
    'no token' => [null],
    'a bad token' => ['not-a-token'],
]);

test('a session cookie never authenticates the API', function () {
    $this->actingAs(User::factory()->create())
        ->getJson(route('api.me'))
        ->assertUnauthorized();
});

test('a request that does not ask for JSON still gets JSON errors, never a redirect', function () {
    $this->get(route('api.me'))->assertUnauthorized()->assertJson(['message' => 'Unauthenticated.']);

    enableSaas();
    $token = personalToken(User::factory()->create());
    $this->get(route('api.sync.pull'), ['Authorization' => "Bearer {$token}"])->assertPaymentRequired();
});

test('a revoked token gets 401', function () {
    $user = User::factory()->create();
    $token = personalToken($user);

    $this->actingAs($user)->delete(route('agents.tokens.destroy', $user->tokens()->sole()->getKey()));

    $this->getJson(route('api.me'), apiAuth($token))->assertUnauthorized();
});

test('a disconnected app gets 401', function () {
    $user = User::factory()->create();
    $token = appOAuthToken($user);
    $clientId = Passport::token()->newQuery()->sole()->client_id;

    $this->actingAs($user)->delete(route('agents.apps.destroy', $clientId));

    $this->getJson(route('api.sync.pull'), apiAuth($token))->assertUnauthorized();
});

test('the OAuth app and the personal token are listed in Settings › Agents & apps', function () {
    $user = User::factory()->create();
    personalToken($user, 'Script');
    appOAuthToken($user);

    $this->actingAs($user)
        ->get(route('agents.edit'))
        ->assertInertia(fn (Assert $page) => $page
            ->where('personalTokens.0.name', 'Script')
            ->where('oauthApps.0.name', 'Plain Week for Mac'));
});

test('in SaaS mode an account without a plan gets 402 on sync, but /me works', function () {
    enableSaas();
    $token = personalToken(User::factory()->create());

    $this->getJson(route('api.me'), apiAuth($token))
        ->assertOk()
        ->assertJsonPath('account', ['hasAccess' => false, 'plan' => null]);

    $this->postJson(route('api.sync.push'), ['tasks' => []], apiAuth($token))->assertPaymentRequired();
    $this->getJson(route('api.sync.pull'), apiAuth($token))->assertPaymentRequired();
});

test('in SaaS mode a subscriber syncs over the API', function () {
    enableSaas();
    $token = personalToken(weeklySubscriber());

    $this->getJson(route('api.me'), apiAuth($token))->assertJsonPath('account', ['hasAccess' => true, 'plan' => 'weekly']);
    $this->getJson(route('api.sync.pull'), apiAuth($token))->assertOk();
});

/**
 * Sends `$limit` requests that pass and expects the next one to be throttled.
 *
 * @param  Closure(): TestResponse  $request
 */
function expectThrottledAfter(int $limit, Closure $request): void
{
    foreach (range(1, $limit) as $attempt) {
        $request()->assertOk();
    }

    $request()->assertTooManyRequests();
}

test('the API sync is limited per user', function () {
    $token = personalToken(User::factory()->create());

    expectThrottledAfter(AppServiceProvider::SYNC_RATE_LIMIT, fn () => test()->postJson(route('api.sync.push'), ['tasks' => []], apiAuth($token)));

    // Another user is not affected.
    $this->getJson(route('api.sync.pull'), apiAuth(personalToken(User::factory()->create())))->assertOk();
});

test('/me is limited per user', function () {
    $token = personalToken(User::factory()->create());

    expectThrottledAfter(AppServiceProvider::API_RATE_LIMIT, fn () => test()->getJson(route('api.me'), apiAuth($token)));
});

test('the web sync is limited per user too', function () {
    $this->actingAs(User::factory()->create());

    expectThrottledAfter(AppServiceProvider::SYNC_RATE_LIMIT, fn () => test()->getJson(route('sync.pull')));
});

test('the protected resource metadata describes the app API', function () {
    $this->getJson('/.well-known/oauth-protected-resource/api/v1')
        ->assertOk()
        ->assertJson([
            'resource' => url('/api/v1'),
            'authorization_servers' => [url('/')],
        ]);
});

test('apps may register a plainweek:// or loopback redirect, other schemes are refused', function (string $redirect, int $status) {
    $this->postJson('/oauth/register', [
        'client_name' => 'App',
        'redirect_uris' => [$redirect],
    ])->assertStatus($status);
})->with([
    [APP_CALLBACK, 201],
    ['http://127.0.0.1:53682/callback', 201],
    ['otherapp://oauth/callback', 400],
]);
