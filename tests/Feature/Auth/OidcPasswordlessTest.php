<?php

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Http;
use Inertia\Testing\AssertableInertia as Assert;

uses(RefreshDatabase::class);

beforeEach(function () {
    useOidc();

    $this->user = User::factory()->create([
        'email' => 'ada@example.com',
        'password' => null,
        'oidc_issuer' => 'https://idp.test',
        'oidc_sub' => 'idp-user-1',
    ]);
});

test('a password-less account never logs in with a password', function (?string $password) {
    $this->post(route('login.store'), ['email' => 'ada@example.com', 'password' => $password]);

    $this->assertGuest();
})->with(['empty' => [''], 'null' => [null], 'any' => ['password']]);

test('an empty password never confirms it', function () {
    $this->actingAs($this->user)
        ->post(route('password.confirm.store'), ['password' => ''])
        ->assertSessionHasErrors('password');

    expect(session('auth.password_confirmed_at'))->toBeNull();
});

test('the confirm-password step offers the IdP instead of a password', function () {
    $this->actingAs($this->user)
        ->get(route('security.edit'))
        ->assertRedirect(route('password.confirm'));

    $this->get(route('password.confirm'))->assertInertia(fn (Assert $page) => $page
        ->component('auth/confirm-password')
        ->where('hasPassword', false)
        ->where('canConfirmWithOidc', true)
        ->where('auth.hasPassword', false));
});

test('the re-authentication asks the IdP to log the user in again', function () {
    Http::fake([
        'https://idp.test/.well-known/openid-configuration' => [
            'issuer' => 'https://idp.test',
            'authorization_endpoint' => 'https://idp.test/authorize',
            'token_endpoint' => 'https://idp.test/token',
            'jwks_uri' => 'https://idp.test/jwks',
        ],
    ]);

    $location = $this->actingAs($this->user)
        ->get(route('oidc.redirect', ['confirm' => 1]))
        ->assertRedirect()
        ->headers->get('Location');

    parse_str((string) parse_url($location, PHP_URL_QUERY), $query);
    expect($query)->toMatchArray(['prompt' => 'login', 'max_age' => '600']);
    expect(session('oidc.intent'))->toBe('confirm');
});

test('re-authenticating at the IdP confirms it and returns to the protected page', function () {
    $this->actingAs($this->user)->get(route('security.edit'));

    oidcCallback(oidcIdentity(), confirm: true)->assertRedirect(route('security.edit'));

    expect(session('auth.password_confirmed_at'))->toBeInt();
    $this->get(route('security.edit'))->assertOk();
});

test('then two-factor can be turned on', function () {
    $this->actingAs($this->user)->post(route('two-factor.enable'))->assertRedirect(route('password.confirm'));
    expect($this->user->fresh()->two_factor_secret)->toBeNull();

    oidcCallback(oidcIdentity(), confirm: true);

    $this->post(route('two-factor.enable'))->assertRedirect();
    expect($this->user->fresh()->two_factor_secret)->not->toBeNull();
});

test('re-authenticating as someone else at the IdP confirms nothing', function () {
    $this->actingAs($this->user);

    oidcCallback(oidcIdentity(['sub' => 'idp-user-2']), confirm: true)
        ->assertRedirect(route('password.confirm'))
        ->assertSessionHas('oidcError', 'wrong_account');

    expect(session('auth.password_confirmed_at'))->toBeNull();
});

test('an old IdP login (auth_time) confirms nothing', function () {
    $this->actingAs($this->user);

    oidcCallback(oidcIdentity(['auth_time' => now()->subHour()->getTimestamp()]), confirm: true)
        ->assertRedirect(route('password.confirm'));

    expect(session('auth.password_confirmed_at'))->toBeNull();
});

test('a password can be set without a current one, right after confirming', function () {
    $this->actingAs($this->user)
        ->put(route('user-password.update'), ['password' => 'new-password', 'password_confirmation' => 'new-password'])
        ->assertSessionHasErrors('password');
    expect($this->user->fresh()->password)->toBeNull();

    $this->withSession(['auth.password_confirmed_at' => time()])
        ->put(route('user-password.update'), ['password' => 'new-password', 'password_confirmation' => 'new-password'])
        ->assertSessionHasNoErrors();

    expect(Hash::check('new-password', $this->user->fresh()->password))->toBeTrue();

    auth()->logout();
    $this->post(route('login.store'), ['email' => 'ada@example.com', 'password' => 'new-password']);
    $this->assertAuthenticatedAs($this->user);
});

test('an account with a password still needs the current one', function () {
    $user = User::factory()->create();

    $this->actingAs($user)
        ->withSession(['auth.password_confirmed_at' => time()])
        ->put(route('user-password.update'), ['password' => 'new-password', 'password_confirmation' => 'new-password'])
        ->assertSessionHasErrors('current_password');
});

test('deleting the account needs a recent confirmation instead of a password', function () {
    $this->actingAs($this->user)
        ->get(route('profile.edit'))
        ->assertInertia(fn (Assert $page) => $page->where('passwordConfirmed', false));

    $this->delete(route('profile.destroy'))->assertSessionHasErrors('password');
    expect($this->user->fresh())->not->toBeNull();

    $this->withSession(['auth.password_confirmed_at' => time()])
        ->delete(route('profile.destroy'))
        ->assertRedirect('/');

    expect($this->user->fresh())->toBeNull();
});
