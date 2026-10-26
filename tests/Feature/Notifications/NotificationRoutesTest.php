<?php

use App\Models\PushSubscription;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia as Assert;

uses(RefreshDatabase::class);

beforeEach(function () {
    config([
        'services.webpush.public_key' => 'BPublicKey_base64url',
        'services.webpush.private_key' => 'private-key',
        'services.webpush.subject' => 'mailto:admin@example.com',
    ]);
    $this->user = User::factory()->create(['timezone' => 'Europe/Madrid']);
});

/**
 * @param  array<string, mixed>  $overrides
 * @return array<string, mixed>
 */
function browserSubscription(array $overrides = []): array
{
    return array_merge([
        'endpoint' => 'https://fcm.googleapis.com/fcm/send/abc123',
        'expirationTime' => null,
        'keys' => [
            'p256dh' => 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM',
            'auth' => 'tBHItJI5svbpez7KI4CCXg',
        ],
    ], $overrides);
}

describe('when Web Push is not configured', function () {
    beforeEach(fn () => config(['services.webpush.subject' => null]));

    test('the routes are 404', function () {
        $this->actingAs($this->user);

        $this->get(route('notifications.edit'))->assertNotFound();
        $this->patch(route('notifications.update'), ['morning_time' => '07:00'])->assertNotFound();
        $this->postJson(route('notifications.subscriptions.store'), browserSubscription())->assertNotFound();
        $this->deleteJson(route('notifications.subscriptions.destroy'), ['endpoint' => 'https://x'])->assertNotFound();
    });

    test('the pages are told notifications are off', function () {
        $this->actingAs($this->user)
            ->get(route('preferences.edit'))
            ->assertInertia(fn (Assert $page) => $page
                ->where('notifications', ['enabled' => false, 'vapidPublicKey' => null]));
    });
});

test('the pages get the public key', function () {
    $this->get(route('home'))
        ->assertInertia(fn (Assert $page) => $page
            ->where('notifications', ['enabled' => true, 'vapidPublicKey' => 'BPublicKey_base64url']));
});

test('guests are sent to log in', function () {
    $this->get(route('notifications.edit'))->assertRedirect(route('login'));
    $this->postJson(route('notifications.subscriptions.store'), browserSubscription())->assertUnauthorized();
});

describe('settings', function () {
    // The page component ships with the client half of Web Push.
    beforeEach(fn () => $this->withoutVite());

    test('the page shows the morning time and time zone', function () {
        $this->actingAs($this->user)
            ->get(route('notifications.edit'))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('settings/notifications', shouldExist: false)
                ->where('morningTime', '08:00')
                ->where('timezone', 'Europe/Madrid'));
    });

    test('the time zone is null until the browser reports one', function () {
        $this->user->forceFill(['timezone' => null])->save();

        $this->actingAs($this->user)
            ->get(route('notifications.edit'))
            ->assertInertia(fn (Assert $page) => $page->component('settings/notifications', shouldExist: false)->where('timezone', null));
    });

    test('the morning time can be changed', function () {
        $this->actingAs($this->user)
            ->from(route('notifications.edit'))
            ->patch(route('notifications.update'), ['morning_time' => '06:45'])
            ->assertRedirect(route('notifications.edit'));

        expect($this->user->fresh()->notification_morning_time)->toBe('06:45');
    });

    test('the morning time must be HH:mm', function (mixed $value) {
        $this->actingAs($this->user)
            ->from(route('notifications.edit'))
            ->patch(route('notifications.update'), ['morning_time' => $value])
            ->assertSessionHasErrors('morning_time');

        expect($this->user->fresh()->notification_morning_time)->toBe('08:00');
    })->with(['', '8:00', '24:00', '08:60', '08:00:00', 'soon', null]);

    test('an account without a plan in SaaS mode is sent to the paywall', function () {
        config(['saas.enabled' => true]);

        $this->actingAs($this->user)->get(route('notifications.edit'))->assertRedirect(route('billing.plans'));
    });
});

describe('subscriptions', function () {
    test('a browser subscribes', function () {
        $this->actingAs($this->user)
            ->postJson(route('notifications.subscriptions.store'), browserSubscription(), ['User-Agent' => 'Firefox'])
            ->assertNoContent();

        $subscription = PushSubscription::sole();
        expect($subscription->user_id)->toBe($this->user->id)
            ->and($subscription->endpoint)->toBe('https://fcm.googleapis.com/fcm/send/abc123')
            ->and($subscription->endpoint_hash)->toBe(hash('sha256', 'https://fcm.googleapis.com/fcm/send/abc123'))
            ->and($subscription->p256dh)->toBe(browserSubscription()['keys']['p256dh'])
            ->and($subscription->auth)->toBe('tBHItJI5svbpez7KI4CCXg')
            ->and($subscription->content_encoding)->toBe('aes128gcm')
            ->and($subscription->user_agent)->toBe('Firefox');
    });

    test('subscribing again updates the keys instead of adding a row', function () {
        $this->actingAs($this->user)->postJson(route('notifications.subscriptions.store'), browserSubscription())->assertNoContent();
        $this->actingAs($this->user)
            ->postJson(route('notifications.subscriptions.store'), browserSubscription(['keys' => ['p256dh' => 'new-key', 'auth' => 'new-auth'], 'content_encoding' => 'aesgcm']))
            ->assertNoContent();

        expect(PushSubscription::sole())
            ->p256dh->toBe('new-key')
            ->auth->toBe('new-auth')
            ->content_encoding->toBe('aesgcm');
    });

    test('a browser that signs in to another account moves its subscription', function () {
        $other = User::factory()->create();

        $this->actingAs($this->user)->postJson(route('notifications.subscriptions.store'), browserSubscription())->assertNoContent();
        $this->actingAs($other)->postJson(route('notifications.subscriptions.store'), browserSubscription())->assertNoContent();

        expect(PushSubscription::sole()->user_id)->toBe($other->id);
    });

    test('subscribing stores the time zone the browser reports', function () {
        $this->actingAs($this->user)
            ->postJson(route('notifications.subscriptions.store'), browserSubscription(), ['X-Timezone' => 'Asia/Tokyo'])
            ->assertNoContent();

        expect($this->user->fresh()->timezone)->toBe('Asia/Tokyo');
    });

    test('a subscription must look like PushSubscription.toJSON()', function (array $payload, string $error) {
        $this->actingAs($this->user)
            ->postJson(route('notifications.subscriptions.store'), $payload)
            ->assertUnprocessable()
            ->assertJsonValidationErrors($error);
    })->with([
        'no endpoint' => [browserSubscription(['endpoint' => null]), 'endpoint'],
        'plain http' => [browserSubscription(['endpoint' => 'http://push.example.com/1']), 'endpoint'],
        'no keys' => [browserSubscription(['keys' => null]), 'keys'],
        'no auth' => [browserSubscription(['keys' => ['p256dh' => 'abc']]), 'keys.auth'],
        'bad key' => [browserSubscription(['keys' => ['p256dh' => 'not base64!', 'auth' => 'abc']]), 'keys.p256dh'],
        'unknown encoding' => [browserSubscription(['content_encoding' => 'gzip']), 'content_encoding'],
    ]);

    test('a browser unsubscribes', function () {
        $this->actingAs($this->user)->postJson(route('notifications.subscriptions.store'), browserSubscription())->assertNoContent();

        $this->actingAs($this->user)
            ->deleteJson(route('notifications.subscriptions.destroy'), ['endpoint' => 'https://fcm.googleapis.com/fcm/send/abc123'])
            ->assertNoContent();

        expect(PushSubscription::count())->toBe(0);
    });

    test('another account cannot delete a subscription', function () {
        $this->actingAs($this->user)->postJson(route('notifications.subscriptions.store'), browserSubscription())->assertNoContent();

        $this->actingAs(User::factory()->create())
            ->deleteJson(route('notifications.subscriptions.destroy'), ['endpoint' => 'https://fcm.googleapis.com/fcm/send/abc123'])
            ->assertNoContent();

        expect(PushSubscription::count())->toBe(1);
    });

    test('an account without a plan in SaaS mode cannot subscribe', function () {
        config(['saas.enabled' => true]);

        $this->actingAs($this->user)
            ->postJson(route('notifications.subscriptions.store'), browserSubscription())
            ->assertStatus(402);
    });
});
