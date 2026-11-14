<?php

use App\Models\Task;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

test('push and pull work over the API with a bearer token, unchanged from the web sync', function () {
    $user = User::factory()->create();
    $token = issueApiToken($user);
    $task = wireTask();

    $this->postJson(route('api.sync.push'), ['tasks' => [$task]], apiAuth($token))
        ->assertOk()
        ->assertExactJson(['applied' => [$task['id']], 'rejected' => [], 'cursor' => 1]);

    $this->getJson(route('api.sync.pull'), apiAuth($token))
        ->assertOk()
        ->assertExactJson(['tasks' => [$task], 'cursor' => 1, 'has_more' => false]);
});

test('the API sync is isolated per token owner', function () {
    $ada = User::factory()->create();
    $bob = User::factory()->create();
    $adaToken = issueApiToken($ada);
    $bobToken = issueApiToken($bob);

    $task = wireTask();
    $this->postJson(route('api.sync.push'), ['tasks' => [$task]], apiAuth($adaToken))->assertOk();

    // Bob cannot pull Ada's task…
    $this->getJson(route('api.sync.pull'), apiAuth($bobToken))
        ->assertOk()
        ->assertExactJson(['tasks' => [], 'cursor' => 0, 'has_more' => false]);

    // …and cannot overwrite it: a record with Ada's id is rejected for Bob.
    $this->postJson(route('api.sync.push'), ['tasks' => [[...$task, 'text' => 'Hijacked']]], apiAuth($bobToken))
        ->assertOk()
        ->assertExactJson(['applied' => [], 'rejected' => [$task['id']], 'cursor' => 0]);

    expect(Task::find($task['id'])->text)->toBe('Buy milk');
});

test('sync without a token is a 401', function () {
    $this->postJson(route('api.sync.push'), ['tasks' => []])->assertUnauthorized();
    $this->getJson(route('api.sync.pull'))->assertUnauthorized();
});

test('in SaaS mode an account without a plan gets 402 on the API sync', function () {
    enableSaas();
    $user = User::factory()->create();
    $token = issueApiToken($user);

    $this->postJson(route('api.sync.push'), ['tasks' => []], apiAuth($token))->assertPaymentRequired();
    $this->getJson(route('api.sync.pull'), apiAuth($token))->assertPaymentRequired();
});

test('the X-Timezone header is stored on the user, like on the web sync', function () {
    $user = User::factory()->create();
    $token = issueApiToken($user);

    $this->getJson(route('api.sync.pull'), [...apiAuth($token), 'X-Timezone' => 'Europe/Madrid'])->assertOk();

    expect($user->fresh()->timezone)->toBe('Europe/Madrid');
});

test('the web sync routes are rate limited to 120 per minute', function () {
    $this->actingAs(User::factory()->create());

    foreach (range(1, 120) as $attempt) {
        $this->postJson(route('sync.push'), ['tasks' => []])->assertOk();
    }

    $this->postJson(route('sync.push'), ['tasks' => []])->assertTooManyRequests();
});
