<?php

use App\Models\ApiToken;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;

uses(RefreshDatabase::class);

test('a device gets a token for email and password; only its hash is stored', function () {
    $user = User::factory()->create(['email' => 'ada@example.com']);

    $response = $this->postJson(route('api.tokens.store'), [
        'email' => 'Ada@Example.com',
        'password' => 'password',
        'name' => 'Pixel 9',
    ])
        ->assertCreated()
        ->assertJsonStructure(['token', 'name'])
        ->assertJsonPath('name', 'Pixel 9');

    $plain = $response->json('token');
    expect($plain)->toBeString()->toHaveLength(64);

    $token = ApiToken::sole();
    expect($token->token_hash)->toBe(ApiToken::hash($plain))
        ->and($token->token_hash)->not->toBe($plain)
        ->and($token->user_id)->toBe($user->id)
        ->and($token->name)->toBe('Pixel 9')
        ->and($token->last_used_at)->not->toBeNull();
});

test('wrong password is a 422 with an email error and issues no token', function () {
    User::factory()->create(['email' => 'ada@example.com']);

    $this->postJson(route('api.tokens.store'), [
        'email' => 'ada@example.com',
        'password' => 'wrong',
    ])->assertUnprocessable()->assertJsonValidationErrors('email');

    expect(ApiToken::count())->toBe(0);
});

test('the input is validated', function () {
    $this->postJson(route('api.tokens.store'), [])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['email', 'password']);
});

test('token issuing is rate limited to five per minute', function () {
    User::factory()->create(['email' => 'ada@example.com']);

    foreach (range(1, 5) as $attempt) {
        $this->postJson(route('api.tokens.store'), [
            'email' => 'ada@example.com',
            'password' => 'wrong',
        ])->assertUnprocessable();
    }

    $this->postJson(route('api.tokens.store'), [
        'email' => 'ada@example.com',
        'password' => 'wrong',
    ])->assertTooManyRequests();
});

test('an account with confirmed 2FA also needs a code, and a wrong one is refused', function () {
    // A valid-length base32 secret, like Fortify stores, so verify() runs and simply says no.
    User::factory()->create([
        'email' => 'ada@example.com',
        'two_factor_secret' => encrypt(str_repeat('A', 32)),
        'two_factor_recovery_codes' => encrypt(json_encode(['recovery-code-1'])),
        'two_factor_confirmed_at' => now(),
    ]);

    $this->postJson(route('api.tokens.store'), [
        'email' => 'ada@example.com',
        'password' => 'password',
    ])->assertUnprocessable()->assertJsonValidationErrors('code');

    $this->postJson(route('api.tokens.store'), [
        'email' => 'ada@example.com',
        'password' => 'password',
        'code' => '000000',
    ])->assertUnprocessable()->assertJsonValidationErrors('code');

    expect(ApiToken::count())->toBe(0);
});

test('me returns the account, the token authenticates, destroy revokes it', function () {
    $user = User::factory()->create(['name' => 'Ada']);
    $token = issueApiToken($user);

    $this->getJson(route('api.me'), apiAuth($token))
        ->assertOk()
        ->assertJsonPath('user.id', $user->id)
        ->assertJsonPath('user.email', $user->email)
        ->assertJsonPath('account.hasAccess', true)
        ->assertJsonMissingPath('user.password')
        ->assertJsonMissingPath('user.two_factor_secret');

    expect(ApiToken::sole()->last_used_at)->not->toBeNull();

    $this->deleteJson(route('api.tokens.destroy'), [], apiAuth($token))->assertNoContent();

    $this->getJson(route('api.me'), apiAuth($token))->assertUnauthorized();
    expect(ApiToken::count())->toBe(0);
});

test('a missing or unknown token is a 401', function () {
    $this->getJson(route('api.me'))->assertUnauthorized();
    $this->getJson(route('api.me'), apiAuth(Str::random(64)))->assertUnauthorized();
});
