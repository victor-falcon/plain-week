<?php

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\Support\FakeStripe;

uses(RefreshDatabase::class);

beforeEach(function () {
    $this->stripe = enableSaas();
});

afterEach(fn () => FakeStripe::uninstall());

test('weekly checkout starts a tax-calculated subscription that requires accepting the terms', function () {
    $user = User::factory()->create(['email' => 'ana@example.com']);
    $this->actingAs($user);

    $this->post(route('billing.checkout', 'weekly'))
        ->assertRedirect('https://checkout.stripe.com/c/pay/cs_test');

    expect($this->stripe->lastRequest('post', '/v1/customers'))->toMatchArray(['email' => 'ana@example.com'])
        ->and($user->refresh()->stripe_id)->toBe('cus_test');

    $session = $this->stripe->lastRequest('post', '/v1/checkout/sessions');

    expect($session)
        ->toMatchArray([
            'mode' => 'subscription',
            'customer' => 'cus_test',
            'client_reference_id' => (string) $user->id,
            'success_url' => route('billing.success').'?session_id={CHECKOUT_SESSION_ID}',
            'cancel_url' => route('billing.plans'),
            'automatic_tax' => ['enabled' => true],
            'tax_id_collection' => ['enabled' => true],
            'consent_collection' => ['terms_of_service' => 'required'],
            'metadata' => ['plan' => 'weekly'],
        ])
        ->and($session['line_items'])->toBe([['price' => 'price_weekly', 'quantity' => 1]])
        ->and($session)->not->toHaveKey('discounts')
        ->and($session['custom_text']['terms_of_service_acceptance']['message'])
        ->toContain('14-day right of withdrawal')
        ->toContain(route('legal.terms'));
});

test('lifetime checkout is a one-time payment with the launch coupon and an invoice', function () {
    $this->actingAs(User::factory()->create());

    $this->post(route('billing.checkout', 'lifetime'))->assertRedirect('https://checkout.stripe.com/c/pay/cs_test');

    $session = $this->stripe->lastRequest('post', '/v1/checkout/sessions');

    expect($session)->toMatchArray([
        'mode' => 'payment',
        'line_items' => [['price' => 'price_lifetime', 'quantity' => 1]],
        'discounts' => [['coupon' => 'LAUNCH75']],
        'invoice_creation' => ['enabled' => true, 'invoice_data' => ['metadata' => ['is_on_session_checkout' => true]]],
        'automatic_tax' => ['enabled' => true],
        'consent_collection' => ['terms_of_service' => 'required'],
        'metadata' => ['plan' => 'lifetime'],
    ]);
});

test('lifetime checkout has no discount without a launch coupon', function () {
    config(['saas.launch_coupon' => null]);
    $this->actingAs(User::factory()->create());

    $this->post(route('billing.checkout', 'lifetime'))->assertRedirect();

    expect($this->stripe->lastRequest('post', '/v1/checkout/sessions'))->not->toHaveKey('discounts');
});

test('an Inertia visit gets an external redirect and a plain fetch gets the URL', function () {
    $this->actingAs(User::factory()->create());

    $this->post(route('billing.checkout', 'weekly'), [], ['X-Inertia' => 'true'])
        ->assertStatus(409)
        ->assertHeader('X-Inertia-Location', 'https://checkout.stripe.com/c/pay/cs_test');

    $this->postJson(route('billing.checkout', 'weekly'))
        ->assertOk()
        ->assertExactJson(['url' => 'https://checkout.stripe.com/c/pay/cs_test']);
});

test('a weekly subscriber can upgrade to lifetime but not subscribe again', function () {
    $this->actingAs(weeklySubscriber());

    $this->post(route('billing.checkout', 'weekly'))->assertRedirect(route('billing.edit'));
    $this->postJson(route('billing.checkout', 'weekly'))->assertStatus(409);
    $this->post(route('billing.checkout', 'lifetime'))->assertRedirect('https://checkout.stripe.com/c/pay/cs_test');
});

test('a lifetime account cannot buy again', function (string $plan) {
    $this->actingAs(User::factory()->create(['lifetime_purchased_at' => now()]));

    $this->post(route('billing.checkout', $plan))->assertRedirect(route('billing.edit'));
    expect($this->stripe->requests)->toBeEmpty();
})->with(['weekly', 'lifetime']);

test('an unknown plan is a 404', function () {
    $this->actingAs(User::factory()->create());

    $this->post('/billing/checkout/monthly')->assertNotFound();
});

test('a guest who picks a plan logs in first and comes back to it', function () {
    $this->get(route('billing.checkout', 'lifetime'))->assertRedirect(route('login'));

    expect(session('url.intended'))->toBe(route('billing.checkout', 'lifetime'));
});

test('a paid lifetime checkout grants access on return, before the webhook', function () {
    $user = User::factory()->create(['stripe_id' => 'cus_test']);
    $this->actingAs($user);
    $this->stripe->on('get', '/v1/checkout/sessions/cs_paid', [
        'id' => 'cs_paid', 'object' => 'checkout.session', 'customer' => 'cus_test', 'mode' => 'payment',
        'status' => 'complete', 'payment_status' => 'paid', 'payment_intent' => 'pi_paid',
        'metadata' => ['plan' => 'lifetime'], 'subscription' => null,
    ]);

    $this->get(route('billing.success', ['session_id' => 'cs_paid']))->assertRedirect(route('home'));

    expect($user->refresh())
        ->hasLifetime()->toBeTrue()
        ->lifetime_payment_id->toBe('pi_paid');
});

test('a completed weekly checkout stores the subscription on return', function () {
    $user = User::factory()->create(['stripe_id' => 'cus_test']);
    $this->actingAs($user);
    $this->stripe->on('get', '/v1/checkout/sessions/cs_weekly', [
        'id' => 'cs_weekly', 'object' => 'checkout.session', 'customer' => 'cus_test', 'mode' => 'subscription',
        'status' => 'complete', 'payment_status' => 'paid', 'metadata' => ['plan' => 'weekly'],
        'subscription' => stripeSubscription(),
    ]);

    $this->get(route('billing.success', ['session_id' => 'cs_weekly']))->assertRedirect(route('home'));

    expect($user->refresh()->plan()?->value)->toBe('weekly');
    push([wireTask()])->assertOk();
});

test('an unconfirmed or foreign checkout session waits on the paywall', function (array $session) {
    $user = User::factory()->create(['stripe_id' => 'cus_test']);
    $this->actingAs($user);
    $this->stripe->on('get', '/v1/checkout/sessions/cs_other', [
        'id' => 'cs_other', 'object' => 'checkout.session', 'mode' => 'payment', 'payment_intent' => 'pi_other',
        'metadata' => ['plan' => 'lifetime'], 'subscription' => null, ...$session,
    ]);

    $this->get(route('billing.success', ['session_id' => 'cs_other']))
        ->assertRedirect(route('billing.plans', ['processing' => 1]));

    expect($user->refresh()->hasAccess())->toBeFalse();
    $this->get(route('billing.plans', ['processing' => 1]))
        ->assertInertia(fn (Assert $page) => $page->where('processing', true));
})->with([
    'another customer' => [['customer' => 'cus_other', 'status' => 'complete', 'payment_status' => 'paid']],
    'payment pending' => [['customer' => 'cus_test', 'status' => 'complete', 'payment_status' => 'unpaid']],
]);

test('Settings › Billing shows the weekly plan with its renewal date and the lifetime upgrade', function () {
    $this->actingAs(weeklySubscriber());
    $renewal = now()->addWeek()->startOfSecond();
    $this->stripe->on('get', '/v1/subscription_items/si_test', [
        'id' => 'si_test', 'object' => 'subscription_item', 'current_period_end' => $renewal->timestamp,
    ]);

    $this->get(route('billing.edit'))
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->component('settings/billing')
            ->where('plan', 'weekly')
            ->where('subscription.cancelled', false)
            ->where('subscription.renewsAt', $renewal->toAtomString())
            ->where('lifetimeOffer.price', '€16'));
});

test('Settings › Billing shows a lifetime plan without an upgrade', function () {
    $this->actingAs(User::factory()->create(['lifetime_purchased_at' => now()]));

    $this->get(route('billing.edit'))
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page->where('plan', 'lifetime')->where('lifetimeOffer', null));
});

test('the portal opens for Stripe customers only', function () {
    $this->stripe->on('post', '/v1/billing_portal/sessions', ['id' => 'bps_test', 'object' => 'billing_portal.session', 'url' => 'https://billing.stripe.com/p/session/test']);

    $this->actingAs(User::factory()->create());
    $this->get(route('billing.portal'))->assertNotFound();

    $this->actingAs(weeklySubscriber());
    $this->get(route('billing.portal'))->assertRedirect('https://billing.stripe.com/p/session/test');
    expect($this->stripe->lastRequest('post', '/v1/billing_portal/sessions'))
        ->toMatchArray(['customer' => 'cus_test', 'return_url' => route('billing.edit')]);
});
