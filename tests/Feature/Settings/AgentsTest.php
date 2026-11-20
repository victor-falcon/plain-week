<?php

use App\Agents\AgentAccess;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Date;
use Illuminate\Support\Str;
use Inertia\Testing\AssertableInertia as Assert;
use Laravel\Passport\ClientRepository;
use Laravel\Passport\Passport;

uses(RefreshDatabase::class);

beforeEach(function () {
    usePassportKeys();
});

/**
 * An OAuth app the user approved: a registered client and an access token with its refresh token.
 */
function connectApp(User $user, string $name = 'Claude', array $token = []): string
{
    $client = app(ClientRepository::class)->createAuthorizationCodeGrantClient($name, ['https://claude.ai/api/mcp/auth_callback'], confidential: false);
    $id = 'tok_'.Str::random(20);

    Passport::token()->newQuery()->forceCreate([
        'id' => $id,
        'user_id' => $user->id,
        'client_id' => $client->id,
        'scopes' => ['mcp:use'],
        'revoked' => false,
        'created_at' => now(),
        'updated_at' => now(),
        'expires_at' => now()->addDay(),
        ...$token,
    ]);
    Passport::refreshToken()->newQuery()->forceCreate([
        'id' => 'ref_'.Str::random(20),
        'access_token_id' => $id,
        'revoked' => false,
        'expires_at' => now()->addYear(),
    ]);

    return (string) $client->id;
}

test('guests are sent to log in', function () {
    $this->get(route('agents.edit'))->assertRedirect(route('login'));
});

test('the page shows the MCP URL, the tokens and the connected apps', function () {
    Date::setTestNow('2026-11-20 10:00:00');
    $user = User::factory()->create();
    app(AgentAccess::class)->createPersonalToken($user, 'Laptop');
    connectApp($user, 'Claude', ['last_used_at' => '2026-11-20 09:58:00']);
    // Another user's token and app are never listed.
    app(AgentAccess::class)->createPersonalToken(User::factory()->create(), 'Not mine');

    $this->actingAs($user)
        ->get(route('agents.edit'))
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->component('settings/agents')
            ->where('mcpUrl', url('/mcp'))
            ->has('personalTokens', 1)
            ->where('personalTokens.0.name', 'Laptop')
            ->where('personalTokens.0.lastUsedAt', null)
            ->has('oauthApps', 1)
            ->where('oauthApps.0.name', 'Claude')
            ->where('oauthApps.0.lastUsedAt', '2026-11-20T09:58:00+00:00'));
});

test('an app whose access token expired is still connected while it can refresh', function () {
    $user = User::factory()->create();
    connectApp($user, 'Claude', ['expires_at' => now()->subHour()]);

    $this->actingAs($user)
        ->get(route('agents.edit'))
        ->assertInertia(fn (Assert $page) => $page->has('oauthApps', 1));
});

test('creating a token shows its secret once and it works', function () {
    $user = User::factory()->create();

    $response = $this->actingAs($user)
        ->post(route('agents.tokens.store'), ['name' => 'Claude Code'])
        ->assertRedirect(route('agents.edit'));

    $flash = $response->baseResponse->getSession()->get('inertia.flash_data') ?? session('inertia.flash_data');
    $token = $flash['newToken']['token'] ?? null;
    expect($flash['newToken']['name'] ?? null)->toBe('Claude Code')
        ->and($token)->toBeString();

    mcp($token, 'tools/list')->assertOk();

    // The secret is never stored or listed.
    $this->actingAs($user)
        ->get(route('agents.edit'))
        ->assertInertia(fn (Assert $page) => $page->where('personalTokens.0.name', 'Claude Code')->missing('personalTokens.0.token'));
});

test('a token needs a name', function () {
    $this->actingAs(User::factory()->create())
        ->post(route('agents.tokens.store'), ['name' => ''])
        ->assertSessionHasErrors('name');
});

test('revoking a token cuts the agent off', function () {
    $user = User::factory()->create();
    $token = app(AgentAccess::class)->createPersonalToken($user, 'Laptop');
    $id = $user->tokens()->sole()->getKey();

    $this->actingAs($user)
        ->delete(route('agents.tokens.destroy', $id))
        ->assertRedirect(route('agents.edit'));

    $this->assertDatabaseCount('oauth_access_tokens', 0);
    mcp($token, 'tools/list')->assertUnauthorized();
});

test('a user cannot revoke someone else\'s token', function () {
    $other = User::factory()->create();
    app(AgentAccess::class)->createPersonalToken($other, 'Theirs');

    $this->actingAs(User::factory()->create())
        ->delete(route('agents.tokens.destroy', $other->tokens()->sole()->getKey()))
        ->assertNotFound();

    $this->assertDatabaseCount('oauth_access_tokens', 1);
});

test('disconnecting an app deletes its tokens and refresh tokens', function () {
    $user = User::factory()->create();
    $clientId = connectApp($user);
    app(AgentAccess::class)->createPersonalToken($user, 'Laptop');

    $this->actingAs($user)
        ->delete(route('agents.apps.destroy', $clientId))
        ->assertRedirect(route('agents.edit'));

    $this->assertDatabaseMissing('oauth_access_tokens', ['client_id' => $clientId]);
    $this->assertDatabaseCount('oauth_refresh_tokens', 0);
    // The personal token stays.
    expect(app(AgentAccess::class)->personalTokens($user))->toHaveCount(1);
});

test('a user cannot disconnect someone else\'s app', function () {
    $clientId = connectApp(User::factory()->create());

    $this->actingAs(User::factory()->create())
        ->delete(route('agents.apps.destroy', $clientId))
        ->assertNotFound();

    $this->assertDatabaseHas('oauth_access_tokens', ['client_id' => $clientId]);
});

test('without a plan in SaaS mode the page stays reachable', function () {
    enableSaas();

    $this->actingAs(User::factory()->create())
        ->get(route('agents.edit'))
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page->where('account.hasAccess', false));
});
