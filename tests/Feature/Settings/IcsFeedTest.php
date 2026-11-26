<?php

use App\Models\IcsFeed;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Inertia\Testing\AssertableInertia as Assert;

uses(RefreshDatabase::class);

beforeEach(function () {
    // The integrations page still needs Google credentials (its card is the only one shown so far).
    config(['services.google.client_id' => 'client-id', 'services.google.client_secret' => 'client-secret']);
    $this->user = User::factory()->create();
});

test('enabling creates a feed with a 43-character URL-safe token, stored hashed and encrypted', function () {
    $this->actingAs($this->user)
        ->post(route('integrations.ics.store'))
        ->assertRedirect(route('integrations.edit'))
        ->assertInertiaFlash('toast.message', 'Calendar feed enabled.');

    $feed = $this->user->icsFeed()->sole();
    $row = DB::table('ics_feeds')->where('id', $feed->id)->sole();

    expect($feed->token)->toMatch('/^[A-Za-z0-9_-]{43}$/')
        ->and($row->token_hash)->toBe(hash('sha256', $feed->token))
        ->and($row->token)->not->toContain($feed->token)
        ->and($feed->url())->toBe(url("/calendar/{$feed->token}.ics"));
});

test('enabling again regenerates the token, so the old URL stops working', function () {
    $old = IcsFeed::enableFor($this->user);

    $this->actingAs($this->user)
        ->post(route('integrations.ics.store'))
        ->assertRedirect(route('integrations.edit'))
        ->assertInertiaFlash('toast.message', 'New calendar feed URL created. The old one no longer works.');

    $new = $this->user->icsFeed()->sole();

    expect($new->token)->not->toBe($old->token)
        ->and(IcsFeed::findByToken($old->token))->toBeNull()
        ->and(IcsFeed::findByToken($new->token)?->id)->toBe($new->id);
});

test('disabling deletes the feed, and works when it is already off', function () {
    IcsFeed::enableFor($this->user);

    $this->actingAs($this->user)
        ->delete(route('integrations.ics.destroy'))
        ->assertRedirect(route('integrations.edit'))
        ->assertInertiaFlash('toast.message', 'Calendar feed disabled.');

    expect(IcsFeed::count())->toBe(0);

    $this->actingAs($this->user)->delete(route('integrations.ics.destroy'))->assertRedirect(route('integrations.edit'));
});

test('the routes need no Google credentials', function () {
    config(['services.google.client_id' => null]);

    $this->actingAs($this->user)->post(route('integrations.ics.store'))->assertRedirect();
    $this->actingAs($this->user)->delete(route('integrations.ics.destroy'))->assertRedirect();
});

test('guests are redirected to the login page', function () {
    $this->post(route('integrations.ics.store'))->assertRedirect(route('login'));
    $this->delete(route('integrations.ics.destroy'))->assertRedirect(route('login'));
});

test('in SaaS mode enabling or regenerating needs a plan, but disabling does not', function () {
    config(['saas.enabled' => true]);
    $feed = IcsFeed::enableFor($this->user);

    $this->actingAs($this->user)->post(route('integrations.ics.store'))->assertRedirect(route('billing.plans'));
    expect($this->user->icsFeed()->sole()->token)->toBe($feed->token);

    $this->actingAs($this->user)->delete(route('integrations.ics.destroy'))->assertRedirect(route('integrations.edit'));
    expect(IcsFeed::count())->toBe(0);
});

test('the integrations page passes the feed URL, or null when it is off', function () {
    $this->actingAs($this->user)
        ->get(route('integrations.edit'))
        ->assertInertia(fn (Assert $page) => $page
            ->where('icsFeed', null)
            ->where('canEnableIcsFeed', true));

    $feed = IcsFeed::enableFor($this->user);

    $this->actingAs($this->user->fresh())
        ->get(route('integrations.edit'))
        ->assertInertia(fn (Assert $page) => $page->where('icsFeed', ['url' => $feed->url()]));
});

test('in SaaS mode the page says whether the account can enable the feed', function () {
    config(['saas.enabled' => true]);

    $this->actingAs($this->user)
        ->get(route('integrations.edit'))
        ->assertInertia(fn (Assert $page) => $page->where('canEnableIcsFeed', false));
});

test('the feed is offered to every page, even without Google credentials', function () {
    config(['services.google.client_id' => null]);

    $this->actingAs($this->user)
        ->get(route('profile.edit'))
        ->assertInertia(fn (Assert $page) => $page->where('integrations.icsFeed', true));
});

test('deleting the account deletes the feed', function () {
    IcsFeed::enableFor($this->user);

    $this->actingAs($this->user)
        ->delete(route('profile.destroy'), ['password' => 'password'])
        ->assertRedirect(route('home'));

    expect(IcsFeed::count())->toBe(0);
});
