<?php

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Inertia\Testing\AssertableInertia as Assert;

uses(RefreshDatabase::class);

beforeEach(function () {
    usePassportKeys();
});

const CLAUDE_CALLBACK = 'https://claude.ai/api/mcp/auth_callback';

/**
 * Registers a client the way claude.ai does (dynamic client registration) and returns its id.
 */
function registerClaude(): string
{
    return test()->postJson('/oauth/register', [
        'client_name' => 'Claude',
        'redirect_uris' => [CLAUDE_CALLBACK],
        'grant_types' => ['authorization_code', 'refresh_token'],
        'token_endpoint_auth_method' => 'none',
    ])->assertCreated()->json('client_id');
}

/**
 * The authorization request a public client sends, with PKCE.
 *
 * @return array{query: array<string, string>, verifier: string}
 */
function authorizationRequest(string $clientId): array
{
    $verifier = Str::random(64);

    return [
        'verifier' => $verifier,
        'query' => [
            'response_type' => 'code',
            'client_id' => $clientId,
            'redirect_uri' => CLAUDE_CALLBACK,
            'state' => 'state-123',
            'scope' => 'mcp:use',
            'code_challenge' => rtrim(strtr(base64_encode(hash('sha256', $verifier, true)), '+/', '-_'), '='),
            'code_challenge_method' => 'S256',
        ],
    ];
}

/**
 * Approves on the consent card and returns the query the client is sent back with.
 *
 * @param  array<string, string>  $query
 * @return array<string, string>
 */
function approveConsent(User $user, array $query): array
{
    $authToken = null;

    test()->actingAs($user)
        ->get('/oauth/authorize?'.http_build_query($query))
        ->assertOk()
        ->assertInertia(function (Assert $page) use (&$authToken) {
            $page->component('oauth/authorize');
            $authToken = $page->toArray()['props']['authToken'];
        });

    $location = test()->post('/oauth/authorize', [
        'state' => $query['state'],
        'client_id' => $query['client_id'],
        'auth_token' => $authToken,
    ])->assertRedirect()->headers->get('Location');

    expect($location)->toStartWith(CLAUDE_CALLBACK.'?');
    parse_str((string) parse_url((string) $location, PHP_URL_QUERY), $result);

    return $result;
}

/**
 * @return array{access_token: string, refresh_token: string}
 */
function exchangeCode(string $clientId, string $code, string $verifier): array
{
    return test()->postJson('/oauth/token', [
        'grant_type' => 'authorization_code',
        'client_id' => $clientId,
        'redirect_uri' => CLAUDE_CALLBACK,
        'code_verifier' => $verifier,
        'code' => $code,
    ])->assertOk()->json();
}

test('the protected resource metadata points MCP clients at the authorization server', function () {
    $this->getJson('/.well-known/oauth-protected-resource/mcp')
        ->assertOk()
        ->assertJson([
            'resource' => url('/mcp'),
            'authorization_servers' => [url('/')],
            'scopes_supported' => ['mcp:use'],
        ]);
});

test('the authorization server metadata lists the endpoints and PKCE', function () {
    $this->getJson('/.well-known/oauth-authorization-server')
        ->assertOk()
        ->assertJson([
            'issuer' => url('/'),
            'authorization_endpoint' => url('/oauth/authorize'),
            'token_endpoint' => url('/oauth/token'),
            'registration_endpoint' => url('/oauth/register'),
            'code_challenge_methods_supported' => ['S256'],
        ]);
});

test('an unauthenticated MCP request gets 401 with the resource metadata', function () {
    mcp(null, 'tools/list')
        ->assertUnauthorized()
        ->assertHeader('WWW-Authenticate', 'Bearer realm="mcp", resource_metadata="'.url('/.well-known/oauth-protected-resource/mcp').'"');
});

test('an invalid token gets 401', function () {
    mcp('not-a-token', 'tools/list')->assertUnauthorized();
});

test('a client registers itself, the user approves it and its token reaches the MCP server', function () {
    $user = User::factory()->create(['name' => 'Ada', 'email' => 'ada@example.com']);
    $clientId = registerClaude();
    ['query' => $query, 'verifier' => $verifier] = authorizationRequest($clientId);

    $callback = approveConsent($user, $query);
    expect($callback['state'])->toBe('state-123');

    $tokens = exchangeCode($clientId, $callback['code'], $verifier);
    expect($tokens)->toHaveKeys(['access_token', 'refresh_token']);

    mcp($tokens['access_token'], 'tools/call', ['name' => 'get_profile'])
        ->assertOk()
        ->assertJsonPath('result.isError', false)
        ->assertJsonPath('result.structuredContent.email', 'ada@example.com');

    $this->assertDatabaseHas('oauth_access_tokens', ['user_id' => $user->id, 'client_id' => $clientId]);
    expect($user->tokens()->first()->getAttribute('last_used_at'))->not->toBeNull();
});

test('the consent card shows the app, the account and where it goes back to', function () {
    $user = User::factory()->create(['email' => 'ada@example.com']);
    ['query' => $query] = authorizationRequest(registerClaude());

    $this->actingAs($user)
        ->get('/oauth/authorize?'.http_build_query($query))
        ->assertOk()
        ->assertHeader('X-Frame-Options', 'DENY')
        ->assertInertia(fn (Assert $page) => $page
            ->component('oauth/authorize')
            ->where('client.name', 'Claude')
            ->where('account.email', 'ada@example.com')
            ->where('redirectHost', 'claude.ai')
            ->where('state', 'state-123')
            ->has('authToken')
            ->has('csrfToken'));
});

test('a guest is sent to log in and comes back to the consent card', function () {
    $user = User::factory()->create();
    ['query' => $query] = authorizationRequest(registerClaude());
    $url = '/oauth/authorize?'.http_build_query($query);

    $this->get($url)->assertRedirect(route('login'));

    $location = $this->post(route('login.store'), ['email' => $user->email, 'password' => 'password'])
        ->assertRedirect()
        ->headers->get('Location');

    expect($location)->toStartWith(url('/oauth/authorize?'));
    parse_str((string) parse_url((string) $location, PHP_URL_QUERY), $intended);
    expect($intended)->toEqual($query);
});

test('denying sends the client back with access_denied and issues nothing', function () {
    $user = User::factory()->create();
    ['query' => $query] = authorizationRequest(registerClaude());
    $authToken = null;

    $this->actingAs($user)
        ->get('/oauth/authorize?'.http_build_query($query))
        ->assertInertia(function (Assert $page) use (&$authToken) {
            $authToken = $page->toArray()['props']['authToken'];
        });

    $location = $this->delete('/oauth/authorize', [
        'state' => 'state-123',
        'client_id' => $query['client_id'],
        'auth_token' => $authToken,
    ])->assertRedirect()->headers->get('Location');

    expect($location)->toStartWith(CLAUDE_CALLBACK.'?')->toContain('error=access_denied');
    $this->assertDatabaseCount('oauth_access_tokens', 0);
});

test('an app the user already approved goes straight back to it, also after logging in through Inertia', function () {
    $user = User::factory()->create();
    $clientId = registerClaude();
    ['query' => $query, 'verifier' => $verifier] = authorizationRequest($clientId);
    exchangeCode($clientId, approveConsent($user, $query)['code'], $verifier);

    $this->actingAs($user)
        ->get('/oauth/authorize?'.http_build_query($query), ['X-Inertia' => 'true'])
        ->assertStatus(409)
        ->assertHeader('X-Inertia-Location');
});

test('refreshing gives a new access token', function () {
    $user = User::factory()->create();
    $clientId = registerClaude();
    ['query' => $query, 'verifier' => $verifier] = authorizationRequest($clientId);
    $tokens = exchangeCode($clientId, approveConsent($user, $query)['code'], $verifier);

    $refreshed = $this->postJson('/oauth/token', [
        'grant_type' => 'refresh_token',
        'client_id' => $clientId,
        'refresh_token' => $tokens['refresh_token'],
    ])->assertOk()->json();

    mcp($refreshed['access_token'], 'tools/call', ['name' => 'get_profile'])->assertOk();
});

test('registration is throttled per IP', function () {
    for ($i = 0; $i < 30; $i++) {
        $this->postJson('/oauth/register', ['client_name' => 'Nope'])->assertStatus(400);
    }

    $this->postJson('/oauth/register', ['client_name' => 'Nope'])->assertTooManyRequests();
});

test('registration refuses a client without redirect URIs', function () {
    $this->postJson('/oauth/register', ['client_name' => 'Nope'])
        ->assertStatus(400)
        ->assertJsonPath('error', 'invalid_redirect_uri');
});

test('deleting the account deletes its tokens', function () {
    $user = User::factory()->create();
    $clientId = registerClaude();
    ['query' => $query, 'verifier' => $verifier] = authorizationRequest($clientId);
    $tokens = exchangeCode($clientId, approveConsent($user, $query)['code'], $verifier);

    $user->delete();

    $this->assertDatabaseCount('oauth_access_tokens', 0);
    $this->assertDatabaseCount('oauth_refresh_tokens', 0);
    mcp($tokens['access_token'], 'tools/list')->assertUnauthorized();
});
