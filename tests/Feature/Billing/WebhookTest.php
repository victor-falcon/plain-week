<?php

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Tests\Support\FakeStripe;

uses(RefreshDatabase::class);

beforeEach(function () {
    $this->stripe = enableSaas();
});

afterEach(fn () => FakeStripe::uninstall());

/**
 * @param  array<string, mixed>  $object
 */
function webhook(string $type, array $object): TestResponse
{
    $payload = json_encode(['id' => 'evt_test', 'type' => $type, 'data' => ['object' => $object]], JSON_THROW_ON_ERROR);
    $timestamp = time();
    $signature = hash_hmac('sha256', "{$timestamp}.{$payload}", 'whsec_test');

    return test()->call('POST', '/stripe/webhook', server: [
        'CONTENT_TYPE' => 'application/json',
        'HTTP_STRIPE_SIGNATURE' => "t={$timestamp},v1={$signature}",
    ], content: $payload);
}

/**
 * @param  array<string, mixed>  $overrides
 * @return array<string, mixed>
 */
function lifetimeSession(array $overrides = []): array
{
    return [
        'id' => 'cs_test', 'object' => 'checkout.session', 'customer' => 'cus_test', 'mode' => 'payment',
        'status' => 'complete', 'payment_status' => 'paid', 'payment_intent' => 'pi_test',
        'metadata' => ['plan' => 'lifetime'], ...$overrides,
    ];
}

test('a paid lifetime checkout grants lifetime access', function () {
    $user = User::factory()->create(['stripe_id' => 'cus_test']);

    webhook('checkout.session.completed', lifetimeSession())->assertOk();

    expect($user->refresh())->hasLifetime()->toBeTrue()->lifetime_payment_id->toBe('pi_test');
});

test('an unpaid checkout waits for the delayed payment to succeed', function () {
    $user = User::factory()->create(['stripe_id' => 'cus_test']);

    webhook('checkout.session.completed', lifetimeSession(['payment_status' => 'unpaid']))->assertOk();
    expect($user->refresh()->hasLifetime())->toBeFalse();

    webhook('checkout.session.async_payment_succeeded', lifetimeSession())->assertOk();
    expect($user->refresh()->hasLifetime())->toBeTrue();
});

test('the lifetime purchase of a weekly subscriber cancels the subscription at period end', function () {
    $user = weeklySubscriber();
    $periodEnd = now()->addDays(3)->startOfSecond();
    $this->stripe
        ->on('post', '/v1/subscriptions/sub_test', stripeSubscription(['cancel_at_period_end' => true]))
        ->on('get', '/v1/subscription_items/si_test', [
            'id' => 'si_test', 'object' => 'subscription_item', 'current_period_end' => $periodEnd->timestamp,
        ]);

    webhook('checkout.session.completed', lifetimeSession())->assertOk();

    expect($this->stripe->lastRequest('post', '/v1/subscriptions/sub_test'))->toMatchArray(['cancel_at_period_end' => 'true'])
        ->and($user->refresh()->plan()?->value)->toBe('lifetime')
        ->and($user->subscription('default')?->ends_at?->timestamp)->toBe($periodEnd->timestamp);
});

test('a repeated event changes nothing', function () {
    $user = User::factory()->create(['stripe_id' => 'cus_test']);

    webhook('checkout.session.completed', lifetimeSession())->assertOk();
    $purchasedAt = $user->refresh()->lifetime_purchased_at;
    $this->travel(1)->hour();
    webhook('checkout.session.completed', lifetimeSession())->assertOk();

    expect($user->refresh()->lifetime_purchased_at?->equalTo($purchasedAt))->toBeTrue();
});

test('a full refund revokes lifetime access, a partial one does not', function () {
    $user = User::factory()->create(['stripe_id' => 'cus_test', 'lifetime_purchased_at' => now(), 'lifetime_payment_id' => 'pi_test']);
    $charge = ['id' => 'ch_test', 'object' => 'charge', 'payment_intent' => 'pi_test', 'customer' => 'cus_test'];

    webhook('charge.refunded', [...$charge, 'refunded' => false, 'amount_refunded' => 100])->assertOk();
    expect($user->refresh()->hasLifetime())->toBeTrue();

    webhook('charge.refunded', [...$charge, 'refunded' => true])->assertOk();
    expect($user->refresh()->hasAccess())->toBeFalse();
    $this->actingAs($user);
    push([wireTask()])->assertStatus(402);
});

test('a refund of another payment keeps lifetime access', function () {
    $user = User::factory()->create(['stripe_id' => 'cus_test', 'lifetime_purchased_at' => now(), 'lifetime_payment_id' => 'pi_test']);

    webhook('charge.refunded', ['id' => 'ch_other', 'object' => 'charge', 'payment_intent' => 'pi_other', 'refunded' => true])->assertOk();

    expect($user->refresh()->hasLifetime())->toBeTrue();
});

test('subscription events from Cashier keep working: created, then deleted ends access', function () {
    $user = User::factory()->create(['stripe_id' => 'cus_test']);

    webhook('customer.subscription.created', stripeSubscription())->assertOk();
    expect($user->refresh()->plan()?->value)->toBe('weekly');

    webhook('customer.subscription.deleted', stripeSubscription(['status' => 'canceled']))->assertOk();
    expect($user->refresh()->hasAccess())->toBeFalse();
});

test('the webhook rejects events with a bad signature', function () {
    $user = User::factory()->create(['stripe_id' => 'cus_test']);

    $this->postJson('/stripe/webhook', ['id' => 'evt_test', 'type' => 'checkout.session.completed', 'data' => ['object' => lifetimeSession()]])
        ->assertForbidden();

    expect($user->refresh()->hasLifetime())->toBeFalse();
});

test('the webhook refuses every event when no signing secret is set', function () {
    config(['cashier.webhook.secret' => null]);
    $user = User::factory()->create(['stripe_id' => 'cus_test']);

    $this->postJson('/stripe/webhook', ['id' => 'evt_test', 'type' => 'checkout.session.completed', 'data' => ['object' => lifetimeSession()]])
        ->assertStatus(503);

    expect($user->refresh()->hasLifetime())->toBeFalse();
});

test('a retried event cancels the weekly plan if cancelling failed the first time', function () {
    $user = weeklySubscriber();
    $user->forceFill(['lifetime_purchased_at' => now(), 'lifetime_payment_id' => 'pi_test'])->save();
    $this->stripe
        ->on('post', '/v1/subscriptions/sub_test', stripeSubscription(['cancel_at_period_end' => true]))
        ->on('get', '/v1/subscription_items/si_test', ['id' => 'si_test', 'object' => 'subscription_item', 'current_period_end' => now()->addDay()->timestamp]);

    webhook('checkout.session.completed', lifetimeSession())->assertOk();

    expect($this->stripe->lastRequest('post', '/v1/subscriptions/sub_test'))->not->toBeNull()
        ->and($user->refresh()->subscription('default')?->onGracePeriod())->toBeTrue();
});
