<?php

use App\Agents\AgentAccess;
use App\Agents\AgentClient;
use App\Models\McpActivity;
use App\Models\User;
use Illuminate\Console\Scheduling\Event;
use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Date;
use Inertia\Testing\AssertableInertia as Assert;
use Laravel\Passport\AccessToken;
use Laravel\Passport\ClientRepository;

uses(RefreshDatabase::class);

beforeEach(function () {
    usePassportKeys();
    Date::setTestNow('2026-11-20 09:00:00');
});

test('a write logs the tool, the token, the tasks and a summary', function () {
    $user = User::factory()->create(['timezone' => 'Europe/Madrid']);
    $token = personalToken($user, 'Laptop');

    $created = toolResult($token, 'create_tasks', ['tasks' => [
        ['text' => 'A', 'date' => '2026-11-23'],
        ['text' => 'B', 'date' => '2026-11-23'],
        ['text' => 'C', 'date' => '2026-11-23'],
    ]])['created'];

    $activity = McpActivity::sole();

    expect($activity->user_id)->toBe($user->id)
        ->and($activity->tool)->toBe('create_tasks')
        ->and($activity->client_type)->toBe(AgentClient::TOKEN)
        ->and($activity->client_id)->toBe((string) $user->tokens()->sole()->getKey())
        ->and($activity->client_name)->toBe('Laptop')
        ->and($activity->task_ids)->toBe(array_column($created, 'id'))
        ->and($activity->summary)->toBe('Created 3 tasks on Mon 23 Nov')
        ->and($activity->created_at->toDateTimeString())->toBe('2026-11-20 09:00:00');
});

test('an entry keeps at most 200 task ids', function () {
    $user = User::factory()->create();
    $ids = array_map(fn (int $i) => "id-{$i}", range(1, 250));

    $activity = McpActivity::record($user, new AgentClient(AgentClient::TOKEN, 't', 'Laptop'), 'import_tasks', 'Imported 250 tasks', $ids);

    expect($activity->fresh()->task_ids)->toBe(array_slice($ids, 0, 200));
});

test('reads and failed writes are not logged', function () {
    $token = personalToken(User::factory()->create());

    toolResult($token, 'list_someday');
    toolResult($token, 'search_tasks', ['query' => 'x']);
    toolError($token, 'delete_task', ['id' => 'missing']);

    expect(McpActivity::count())->toBe(0);
});

test('an OAuth app is logged with its client name', function () {
    $client = app(ClientRepository::class)->createAuthorizationCodeGrantClient('Claude', ['https://claude.ai/api/mcp/auth_callback'], confidential: false);
    $token = new AccessToken(['oauth_access_token_id' => 'tok_1', 'oauth_client_id' => $client->id, 'oauth_user_id' => '1', 'oauth_scopes' => []]);

    expect(app(AgentAccess::class)->clientOf($token))->toEqual(new AgentClient(AgentClient::OAUTH, (string) $client->id, 'Claude'));
});

test('entries older than 90 days are pruned', function () {
    $user = User::factory()->create();
    $old = McpActivity::factory()->for($user)->create(['created_at' => now()->subDays(91)]);
    $recent = McpActivity::factory()->for($user)->create(['created_at' => now()->subDays(89)]);

    $this->artisan('model:prune', ['--model' => [McpActivity::class]])->assertSuccessful();

    expect(McpActivity::pluck('id')->all())->toBe([$recent->id])
        ->and(McpActivity::find($old->id))->toBeNull();
});

test('the prune is scheduled daily', function () {
    $event = collect(app(Schedule::class)->events())
        ->first(fn (Event $event) => str_contains((string) $event->command, 'model:prune') && str_contains((string) $event->command, 'McpActivity'));

    expect($event)->not->toBeNull()
        ->and($event->expression)->toBe('0 0 * * *');
});

test('Settings › Agents lists the user\'s activity, newest first, 20 per page', function () {
    $user = User::factory()->create();
    foreach (range(1, 21) as $i) {
        McpActivity::factory()->for($user)->create(['summary' => "Change {$i}", 'created_at' => now()->subMinutes(30 - $i)]);
    }
    McpActivity::factory()->for($user)->create(['summary' => 'Too old', 'created_at' => now()->subDays(91)]);
    McpActivity::factory()->create(['summary' => 'Not mine']);

    $this->actingAs($user)
        ->get(route('agents.edit'))
        ->assertInertia(fn (Assert $page) => $page
            ->component('settings/agents')
            ->has('activity.entries', 20)
            ->where('activity.entries.0.summary', 'Change 21')
            ->where('activity.entries.0.tool', 'create_tasks')
            ->where('activity.entries.0.clientName', 'Claude Code')
            ->where('activity.entries.0.clientType', 'token')
            ->where('activity.entries.19.summary', 'Change 2')
            ->where('activity.previousPageUrl', null)
            ->where('activity.nextPageUrl', route('agents.edit', ['activity_page' => 2])));

    $this->actingAs($user)
        ->get(route('agents.edit', ['activity_page' => 2]))
        ->assertInertia(fn (Assert $page) => $page
            ->has('activity.entries', 1)
            ->where('activity.entries.0.summary', 'Change 1')
            ->where('activity.nextPageUrl', null));
});
