<?php

use App\Agents\AgentAccess;
use App\Models\User;
use App\Support\AppVersion;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Date;
use Laravel\Mcp\Facades\Mcp;
use Tests\Support\Mcp\ServerWithPlannerTool;

uses(RefreshDatabase::class);

beforeEach(function () {
    usePassportKeys();
});

test('a personal token authenticates the MCP server', function () {
    $user = User::factory()->create();

    mcp(personalToken($user), 'initialize', [
        'protocolVersion' => '2025-06-18',
        'capabilities' => (object) [],
        'clientInfo' => ['name' => 'test', 'version' => '1.0'],
    ])
        ->assertOk()
        ->assertJsonPath('result.serverInfo.name', 'Plain Week')
        ->assertJsonPath('result.serverInfo.version', AppVersion::current())
        ->assertJsonPath('result.instructions', fn (string $text) => str_contains($text, '<series id>:<YYYY-MM-DD>'));
});

test('the server lists get_profile as a read-only tool', function () {
    $user = User::factory()->create();

    $tools = collect(mcp(personalToken($user), 'tools/list')->assertOk()->json('result.tools'))->keyBy('name');

    expect($tools)->toHaveKey('get_profile')
        ->and($tools['get_profile']['annotations']['readOnlyHint'])->toBeTrue();
});

test('get_profile returns the user, their time zone and today there', function () {
    Date::setTestNow('2026-11-20 23:30:00'); // UTC: already Saturday in Madrid
    $user = User::factory()->create(['name' => 'Ada', 'email' => 'ada@example.com', 'timezone' => 'Europe/Madrid']);

    mcp(personalToken($user), 'tools/call', ['name' => 'get_profile'])
        ->assertOk()
        ->assertJsonPath('result.isError', false)
        ->assertJsonPath('result.structuredContent', [
            'name' => 'Ada',
            'email' => 'ada@example.com',
            'timezone' => 'Europe/Madrid',
            'today' => '2026-11-21',
            'weekday' => 'Saturday',
            'app_version' => AppVersion::current(),
            'sync_access' => true,
            'plans_url' => null,
        ]);
});

test('get_profile falls back to the app time zone before the first sync', function () {
    $user = User::factory()->create(['timezone' => null]);

    mcp(personalToken($user), 'tools/call', ['name' => 'get_profile'])
        ->assertJsonPath('result.structuredContent.timezone', config('app.timezone'));
});

test('a revoked personal token stops working', function () {
    $user = User::factory()->create();
    $token = personalToken($user);
    $id = $user->tokens()->sole()->getKey();

    app(AgentAccess::class)->revokePersonalToken($user, $id);

    mcp($token, 'tools/list')->assertUnauthorized();
});

test('a session cookie does not authenticate the MCP server', function () {
    $this->actingAs(User::factory()->create())
        ->postJson('/mcp', ['jsonrpc' => '2.0', 'id' => 1, 'method' => 'tools/list'], ['MCP-Protocol-Version' => '2025-06-18'])
        ->assertUnauthorized();
});

test('the MCP server allows 120 requests a minute per user', function () {
    $token = personalToken(User::factory()->create());

    for ($i = 0; $i < 120; $i++) {
        mcp($token, 'ping')->assertOk();
    }

    mcp($token, 'ping')->assertTooManyRequests();
});

describe('in SaaS mode', function () {
    beforeEach(function () {
        enableSaas();
    });

    test('an account without a plan can connect but tool calls say a plan is needed', function () {
        $user = User::factory()->create();
        $token = personalToken($user);

        mcp($token, 'tools/list')->assertOk();

        // get_profile still answers, so the agent can tell the user why.
        mcp($token, 'tools/call', ['name' => 'get_profile'])
            ->assertJsonPath('result.isError', false)
            ->assertJsonPath('result.structuredContent.sync_access', false)
            ->assertJsonPath('result.structuredContent.plans_url', route('billing.plans'));
    });

    test('every other tool answers with the paywall error and the plans link', function () {
        Mcp::web('/mcp-test', ServerWithPlannerTool::class)->middleware('auth:api');
        $token = personalToken(User::factory()->create());

        app('auth')->forgetGuards();
        $this->postJson('/mcp-test', ['jsonrpc' => '2.0', 'id' => 1, 'method' => 'tools/call', 'params' => ['name' => 'planner_tool']], [
            'Authorization' => 'Bearer '.$token,
            'MCP-Protocol-Version' => '2025-06-18',
        ])
            ->assertOk()
            ->assertJsonPath('result.isError', true)
            ->assertJsonPath('result.content.0.text', 'Plain Week needs a paid plan to use your planner from an AI agent. Choose a plan at '.route('billing.plans').' and try again.');
    });

    test('a subscriber calls the other tools', function () {
        Mcp::web('/mcp-test', ServerWithPlannerTool::class)->middleware('auth:api');
        $token = personalToken(weeklySubscriber());

        app('auth')->forgetGuards();
        $this->postJson('/mcp-test', ['jsonrpc' => '2.0', 'id' => 1, 'method' => 'tools/call', 'params' => ['name' => 'planner_tool']], [
            'Authorization' => 'Bearer '.$token,
            'MCP-Protocol-Version' => '2025-06-18',
        ])
            ->assertJsonPath('result.isError', false)
            ->assertJsonPath('result.content.0.text', 'Planner data.');
    });

    test('a lifetime account uses the tools', function () {
        $user = User::factory()->create(['lifetime_purchased_at' => now()]);

        mcp(personalToken($user), 'tools/call', ['name' => 'get_profile'])
            ->assertJsonPath('result.structuredContent.sync_access', true)
            ->assertJsonPath('result.structuredContent.plans_url', null);
    });
});
