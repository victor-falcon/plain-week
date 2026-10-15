<?php

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia as Assert;

uses(RefreshDatabase::class);

test('guests get the planner', function () {
    $this->get(route('home'))
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page->component('planner'));
});

test('authenticated users get the planner', function () {
    $this->actingAs(User::factory()->create())
        ->get(route('home'))
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page->component('planner'));
});

test('unverified users can use the planner, sync and settings', function () {
    $this->actingAs(User::factory()->unverified()->create());

    $this->get(route('home'))->assertOk();
    $this->getJson(route('sync.pull'))->assertOk();
    $this->get(route('profile.edit'))->assertOk();
    $this->get(route('appearance.edit'))->assertOk();
});

test('registration lands on the planner logged in, even without verifying the email', function () {
    $this->post(route('register.store'), [
        'name' => 'Test User',
        'email' => 'test@example.com',
        'password' => 'password',
        'password_confirmation' => 'password',
    ])->assertRedirect(route('home', absolute: false));

    $this->assertAuthenticated();
    $this->get(route('home'))->assertOk();
});
