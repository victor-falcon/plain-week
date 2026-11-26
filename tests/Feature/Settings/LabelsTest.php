<?php

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia as Assert;

uses(RefreshDatabase::class);

test('guests are redirected to the login page', function () {
    $this->get(route('labels.edit'))->assertRedirect(route('login'));
});

test('the labels page is displayed for users', function () {
    $this->actingAs(User::factory()->create())
        ->get(route('labels.edit'))
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page->component('settings/labels'));
});
