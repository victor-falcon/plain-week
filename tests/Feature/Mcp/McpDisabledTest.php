<?php

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Route;
use Inertia\Testing\AssertableInertia as Assert;

uses(RefreshDatabase::class);

/**
 * Boots the app again as an instance with MCP_ENABLED=false: the routes are registered while booting.
 */
function bootWithMcpDisabled(): void
{
    putenv('MCP_ENABLED=false');
    $_ENV['MCP_ENABLED'] = $_SERVER['MCP_ENABLED'] = 'false';

    test()->refreshApplication();
    test()->artisan('migrate');
    usePassportKeys();
}

afterEach(function () {
    putenv('MCP_ENABLED');
    unset($_ENV['MCP_ENABLED'], $_SERVER['MCP_ENABLED']);
});

test('the MCP server does not exist', function (string $method) {
    bootWithMcpDisabled();

    $this->json($method, '/mcp')->assertNotFound();
})->with(['POST', 'GET', 'DELETE']);

test('OAuth, its metadata and dynamic registration stay available', function () {
    bootWithMcpDisabled();

    $this->getJson('/.well-known/oauth-authorization-server')
        ->assertOk()
        ->assertJsonPath('token_endpoint', url('/oauth/token'));
    $this->getJson('/.well-known/oauth-protected-resource/api/v1')
        ->assertOk()
        ->assertJsonPath('resource', url('/api/v1'));
    $this->postJson('/oauth/register', ['client_name' => 'App', 'redirect_uris' => ['plainweek://oauth/callback']])
        ->assertCreated();
    expect(Route::has(['passport.authorizations.authorize', 'passport.token']))->toBeTrue();
    // An OAuth error from Passport, not a 404.
    $this->postJson('/oauth/token', ['grant_type' => 'authorization_code'])->assertStatus(400);
});

test('the app API keeps working with a token', function () {
    bootWithMcpDisabled();
    $token = personalToken(User::factory()->create());
    $headers = ['Authorization' => "Bearer {$token}"];

    $this->getJson(route('api.me'), $headers)->assertOk();
    $this->getJson(route('api.sync.pull'), $headers)->assertOk();
});

test('Settings › Agents & apps stays, without the MCP part', function () {
    bootWithMcpDisabled();
    $user = User::factory()->create();

    $this->actingAs($user)
        ->get(route('agents.edit'))
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->component('settings/agents')
            ->where('mcpUrl', null)
            ->where('api.baseUrl', url('/api/v1'))
            ->where('mcp.enabled', false));

    $this->actingAs($user)->post(route('agents.tokens.store'), ['name' => 'Desktop'])->assertRedirect(route('agents.edit'));
    expect($user->tokens()->count())->toBe(1);
});

test('it is on by default', function () {
    expect(config('mcp.enabled'))->toBeTrue();

    $this->actingAs(User::factory()->create())
        ->get(route('profile.edit'))
        ->assertInertia(fn (Assert $page) => $page->where('mcp.enabled', true));
});
