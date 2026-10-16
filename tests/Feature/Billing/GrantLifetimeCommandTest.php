<?php

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

test('grants and revokes lifetime access by email', function () {
    config(['saas.enabled' => true]);
    $user = User::factory()->create(['email' => 'owner@example.com']);

    $this->artisan('plainweek:grant-lifetime', ['email' => 'owner@example.com'])
        ->expectsOutput('Lifetime access granted to owner@example.com.')
        ->assertSuccessful();
    expect($user->refresh())->hasAccess()->toBeTrue()->lifetime_payment_id->toBeNull();

    $this->artisan('plainweek:grant-lifetime', ['email' => 'owner@example.com', '--revoke' => true])->assertSuccessful();
    expect($user->refresh()->hasAccess())->toBeFalse();
});

test('fails for an unknown email', function () {
    $this->artisan('plainweek:grant-lifetime', ['email' => 'nobody@example.com'])->assertFailed();
});
