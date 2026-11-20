<?php

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia as Assert;
use Laravel\Passport\Passport;

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
}

afterEach(function () {
    putenv('MCP_ENABLED');
    unset($_ENV['MCP_ENABLED'], $_SERVER['MCP_ENABLED']);
    Passport::$registersRoutes = true;
});

test('the MCP server, OAuth and metadata routes do not exist', function (string $method, string $uri) {
    bootWithMcpDisabled();

    $this->json($method, $uri)->assertNotFound();
})->with([
    ['POST', '/mcp'],
    ['GET', '/.well-known/oauth-protected-resource'],
    ['GET', '/.well-known/oauth-protected-resource/mcp'],
    ['GET', '/.well-known/oauth-authorization-server'],
    ['POST', '/oauth/register'],
    ['GET', '/oauth/authorize'],
    ['POST', '/oauth/token'],
]);

test('Settings › Agents is hidden', function () {
    bootWithMcpDisabled();
    $user = User::factory()->create();

    $this->actingAs($user)->get('/settings/agents')->assertNotFound();
    $this->actingAs($user)->post('/settings/agents/tokens', ['name' => 'x'])->assertNotFound();

    $this->actingAs($user)
        ->get(route('profile.edit'))
        ->assertInertia(fn (Assert $page) => $page->where('mcp.enabled', false));
});

test('it is on by default', function () {
    expect(config('mcp.enabled'))->toBeTrue();

    $this->actingAs(User::factory()->create())
        ->get(route('profile.edit'))
        ->assertInertia(fn (Assert $page) => $page->where('mcp.enabled', true));
});
