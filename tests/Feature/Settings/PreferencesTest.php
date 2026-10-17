<?php

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia as Assert;

uses(RefreshDatabase::class);

test('guests are redirected to the login page', function () {
    $this->get(route('preferences.edit'))->assertRedirect(route('login'));
});

test('the preferences page is displayed for users', function () {
    $this->actingAs(User::factory()->create())
        ->get(route('preferences.edit'))
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page->component('settings/preferences'));
});
