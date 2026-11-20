<?php

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia as Assert;

uses(RefreshDatabase::class);

$signUp = [
    'name' => 'New User',
    'email' => 'new@example.com',
    'password' => 'password',
];

test('sign-up is open by default', function () use ($signUp) {
    expect(config('auth.registration.enabled'))->toBeTrue();
    User::factory()->create();

    $this->get(route('register'))->assertOk();
    $this->get(route('login'))->assertInertia(fn (Assert $page) => $page->where('canRegister', true));

    $this->post(route('register.store'), $signUp)->assertRedirect();
    $this->assertAuthenticated();
});

describe('with REGISTRATION_ENABLED=false', function () use ($signUp) {
    beforeEach(fn () => config(['auth.registration.enabled' => false]));

    test('the sign-up page and form are 404 once a user exists', function () use ($signUp) {
        User::factory()->create();

        $this->get(route('register'))->assertNotFound();
        $this->post(route('register.store'), $signUp)->assertNotFound();

        $this->assertGuest();
        expect(User::query()->where('email', $signUp['email'])->exists())->toBeFalse();
    });

    test('the login page offers no sign-up link', function () {
        User::factory()->create();

        $this->get(route('login'))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page->component('auth/login')->where('canRegister', false));
    });

    test('existing users still log in and reset their password', function () {
        $user = User::factory()->create();

        $this->post(route('password.email'), ['email' => $user->email])->assertSessionHasNoErrors();

        $this->post(route('login.store'), ['email' => $user->email, 'password' => 'password']);
        $this->assertAuthenticatedAs($user);
    });

    test('an instance with no users stays open for its first account', function () use ($signUp) {
        $this->get(route('register'))->assertOk();
        $this->get(route('login'))->assertInertia(fn (Assert $page) => $page->where('canRegister', true));

        $this->post(route('register.store'), $signUp)->assertRedirect();
        $this->assertAuthenticated();

        auth()->logout();
        $this->get(route('register'))->assertNotFound();
    });
});
