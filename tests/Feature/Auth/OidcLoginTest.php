<?php

use App\Models\User;
use Illuminate\Auth\Events\Registered;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Http;
use Inertia\Testing\AssertableInertia as Assert;
use Laravel\Fortify\Events\TwoFactorAuthenticationChallenged;
use Laravel\Socialite\Facades\Socialite;
use Laravel\Socialite\Two\InvalidStateException;

uses(RefreshDatabase::class);

describe('availability', function () {
    test('nothing shows and the routes are 404 while no IdP is configured', function () {
        $this->get(route('oidc.redirect'))->assertNotFound();
        $this->get(route('oidc.callback'))->assertNotFound();

        $this->get(route('login'))->assertInertia(fn (Assert $page) => $page
            ->where('oidc', ['enabled' => false, 'only' => false, 'label' => null]));
    });

    test('an issuer without a client id is not enough', function () {
        useOidc();
        config(['oidc.client_id' => null]);

        $this->get(route('oidc.redirect'))->assertNotFound();
    });

    test('the login page shows the button with the configured label', function () {
        useOidc();
        config(['oidc.label' => 'Log in with Authentik']);

        $this->get(route('login'))->assertInertia(fn (Assert $page) => $page
            ->where('oidc', ['enabled' => true, 'only' => false, 'label' => 'Log in with Authentik'])
            ->where('canRegister', true)
            ->where('canResetPassword', true));
    });

    test('OIDC_ENABLED=false turns it off even when configured', function () {
        useOidc();
        config(['oidc.enabled' => false]);

        $this->get(route('oidc.redirect'))->assertNotFound();
        $this->get(route('oidc.callback'))->assertNotFound();
        $this->get(route('login'))->assertInertia(fn (Assert $page) => $page->where('oidc.enabled', false));
    });

    test('OIDC_ENABLED defaults to on, to off in SaaS mode, and an explicit value wins', function (?string $saas, ?string $enabled, bool $expected) {
        $set = function (string $name, ?string $value): void {
            if ($value === null) {
                unset($_ENV[$name], $_SERVER[$name]);
                putenv($name);
            } else {
                $_ENV[$name] = $_SERVER[$name] = $value;
                putenv("{$name}={$value}");
            }
        };

        $previous = [$_ENV['SAAS_ENABLED'] ?? null, $_ENV['OIDC_ENABLED'] ?? null];

        try {
            $set('SAAS_ENABLED', $saas);
            $set('OIDC_ENABLED', $enabled);

            expect((require config_path('oidc.php'))['enabled'])->toBe($expected);
        } finally {
            $set('SAAS_ENABLED', $previous[0]);
            $set('OIDC_ENABLED', $previous[1]);
        }
    })->with([
        'self-hosted default' => [null, null, true],
        'self-hosted, empty' => [null, '', true],
        'SaaS, empty' => ['true', '', false],
        'self-hosted, explicitly off' => ['false', 'false', false],
        'SaaS default' => ['true', null, false],
        'SaaS, explicitly on' => ['true', 'true', true],
    ]);
});

describe('redirect', function () {
    test('a signed-in user is sent home instead of to the IdP', function () {
        useOidc();

        $this->actingAs(User::factory()->create())
            ->get(route('oidc.redirect'))
            ->assertRedirect(route('home'));
    });

    test('an unreachable IdP sends the user back to the login page', function () {
        useOidc();
        Http::fake(['*' => Http::response('down', 503)]);

        $this->get(route('oidc.redirect'))
            ->assertRedirect(route('login'))
            ->assertSessionHas('oidcError', 'failed');
    });
});

describe('callback', function () {
    beforeEach(fn () => useOidc());

    test('the account linked to the sub logs in', function () {
        $user = User::factory()->create([
            'email' => 'other@example.com',
            'oidc_issuer' => 'https://idp.test',
            'oidc_sub' => 'idp-user-1',
        ]);

        // The email at the IdP changed since: the sub still finds the account.
        oidcCallback(oidcIdentity(['email' => 'ada@example.com']))->assertRedirect(route('home'));

        $this->assertAuthenticatedAs($user);
    });

    test('a sub from another issuer is not the same identity', function () {
        $user = User::factory()->create([
            'email' => 'ada@example.com',
            'oidc_issuer' => 'https://old-idp.test',
            'oidc_sub' => 'idp-user-1',
        ]);

        // Linked again by verified email, to the new issuer.
        oidcCallback(oidcIdentity())->assertRedirect(route('home'));

        $this->assertAuthenticatedAs($user);
        expect($user->fresh()->oidc_issuer)->toBe('https://idp.test');
    });

    test('an existing account with the same verified email is linked', function () {
        $user = User::factory()->withTwoFactor()->create(['email' => 'ada@example.com']);

        oidcCallback(oidcIdentity(['email' => 'Ada@Example.com']))->assertRedirect(route('two-factor.login'));

        $user->refresh();
        expect($user->oidc_issuer)->toBe('https://idp.test')
            ->and($user->oidc_sub)->toBe('idp-user-1')
            ->and($user->hasPassword())->toBeTrue()
            ->and($user->two_factor_secret)->not->toBeNull();
    });

    test('an account whose own email was never verified is linked without its previous credentials', function () {
        // Someone could have signed up with the address before its owner ("pre-hijacking").
        $user = User::factory()->unverified()->withTwoFactor()->create(['email' => 'ada@example.com']);
        DB::table('passkeys')->insert(['user_id' => $user->id, 'name' => 'Key', 'credential_id' => 'cred', 'credential' => '{}']);
        $rememberToken = $user->remember_token;

        oidcCallback(oidcIdentity())->assertRedirect(route('home'));

        $this->assertAuthenticatedAs($user);
        $user->refresh();
        expect($user->oidc_sub)->toBe('idp-user-1')
            ->and($user->email_verified_at)->not->toBeNull()
            ->and($user->hasPassword())->toBeFalse()
            ->and($user->two_factor_secret)->toBeNull()
            ->and($user->two_factor_confirmed_at)->toBeNull()
            ->and($user->passkeys()->count())->toBe(0)
            ->and($user->remember_token)->not->toBe($rememberToken);
    });

    test('"email_verified" sent as the string "true" counts', function () {
        $user = User::factory()->create(['email' => 'ada@example.com']);

        oidcCallback(oidcIdentity(['email_verified' => 'true']));

        $this->assertAuthenticatedAs($user);
    });

    test('an unverified email never links to an existing account', function (mixed $verified) {
        $user = User::factory()->create(['email' => 'ada@example.com']);

        oidcCallback(oidcIdentity(['email_verified' => $verified]))
            ->assertRedirect(route('login'))
            ->assertSessionHas('oidcError', 'unverified_email');

        $this->assertGuest();
        expect($user->fresh()->oidc_sub)->toBeNull();
    })->with([
        'false' => [false],
        'missing' => [null],
        'the string "false"' => ['false'],
        'a truthy string' => ['yes'],
    ]);

    test('an account already linked to another sub at this IdP is not taken over', function () {
        $user = User::factory()->create([
            'email' => 'ada@example.com',
            'oidc_issuer' => 'https://idp.test',
            'oidc_sub' => 'someone-else',
        ]);

        oidcCallback(oidcIdentity())
            ->assertRedirect(route('login'))
            ->assertSessionHas('oidcError', 'linked_elsewhere');

        $this->assertGuest();
        expect($user->fresh()->oidc_sub)->toBe('someone-else');
    });

    test('an identity without an email is refused', function () {
        oidcCallback(oidcIdentity(['email' => null]))
            ->assertRedirect(route('login'))
            ->assertSessionHas('oidcError', 'missing_email');

        $this->assertGuest();
        expect(User::query()->count())->toBe(0);
    });

    test('a new identity gets a password-less account while sign-up is open', function () {
        Event::fake([Registered::class]);

        oidcCallback(oidcIdentity())->assertRedirect(route('home'));

        $user = User::query()->sole();
        $this->assertAuthenticatedAs($user);
        expect($user->name)->toBe('Ada Lovelace')
            ->and($user->email)->toBe('ada@example.com')
            ->and($user->password)->toBeNull()
            ->and($user->email_verified_at)->not->toBeNull()
            ->and($user->oidc_issuer)->toBe('https://idp.test')
            ->and($user->oidc_sub)->toBe('idp-user-1');
        Event::assertDispatched(Registered::class);
    });

    test('a new account from an unverified email is created unverified', function () {
        oidcCallback(oidcIdentity(['email_verified' => false, 'name' => null]));

        $user = User::query()->sole();
        expect($user->email_verified_at)->toBeNull()
            ->and($user->name)->toBe('ada');
    });

    test('no account is created while sign-up is closed', function () {
        config(['auth.registration.enabled' => false]);
        $existing = User::factory()->create();

        oidcCallback(oidcIdentity())
            ->assertRedirect(route('login'))
            ->assertSessionHas('oidcError', 'registration_closed');

        $this->assertGuest();
        expect(User::query()->sole()->is($existing))->toBeTrue();
    });

    test('existing accounts still link and log in while sign-up is closed', function () {
        config(['auth.registration.enabled' => false]);
        $user = User::factory()->create(['email' => 'ada@example.com']);

        oidcCallback(oidcIdentity());

        $this->assertAuthenticatedAs($user);
    });

    test('an account with two-factor on still goes through the challenge', function () {
        Event::fake([TwoFactorAuthenticationChallenged::class]);
        $user = User::factory()->withTwoFactor()->create([
            'oidc_issuer' => 'https://idp.test',
            'oidc_sub' => 'idp-user-1',
        ]);

        oidcCallback(oidcIdentity())
            ->assertRedirect(route('two-factor.login'))
            ->assertSessionHas('login.id', $user->id);

        $this->assertGuest();
        Event::assertDispatched(TwoFactorAuthenticationChallenged::class);

        $this->get(route('two-factor.login'))->assertOk();
    });

    test('a signed-in browser is never switched to another account', function () {
        $signedIn = User::factory()->create();
        User::factory()->create(['oidc_issuer' => 'https://idp.test', 'oidc_sub' => 'idp-user-1']);

        $this->actingAs($signedIn);
        oidcCallback(oidcIdentity())->assertRedirect(route('home'));

        $this->assertAuthenticatedAs($signedIn);
    });

    test('cancelling at the IdP says so', function () {
        $this->withSession(['oidc.intent' => 'login'])
            ->get(route('oidc.callback', ['error' => 'access_denied']))
            ->assertRedirect(route('login'))
            ->assertSessionHas('oidcError', 'cancelled');
    });

    test('an invalid state is refused', function () {
        Socialite::fake('oidc', fn () => throw new InvalidStateException);

        $this->get(route('oidc.callback', ['code' => 'code', 'state' => 'forged']))
            ->assertRedirect(route('login'))
            ->assertSessionHas('oidcError', 'failed');

        $this->assertGuest();
    });

    test('the login page explains a refused login', function () {
        $this->withSession(['oidcError' => 'unverified_email'])
            ->get(route('login'))
            ->assertInertia(fn (Assert $page) => $page->where('oidcError', 'unverified_email'));
    });

    test('the callback is throttled', function () {
        Socialite::fake('oidc', fn () => throw new InvalidStateException);

        foreach (range(1, 20) as $attempt) {
            $this->get(route('oidc.callback'))->assertRedirect();
        }

        $this->get(route('oidc.callback'))->assertTooManyRequests();
    });
});

describe('OIDC_ONLY', function () {
    test('password login, sign-up, password reset and passkey login are gone', function () {
        useOidc(only: true);
        $user = User::factory()->create();

        $this->post(route('login.store'), ['email' => $user->email, 'password' => 'password'])->assertNotFound();
        $this->assertGuest();

        $this->get(route('register'))->assertNotFound();
        $this->post(route('register.store'), ['name' => 'X', 'email' => 'x@example.com', 'password' => 'password'])->assertNotFound();
        $this->get(route('password.request'))->assertNotFound();
        $this->post(route('password.email'), ['email' => $user->email])->assertNotFound();
        $this->get(route('password.reset', ['token' => 'token']))->assertNotFound();
        $this->post(route('password.update'))->assertNotFound();
        $this->get(route('passkey.login-options'))->assertNotFound();
        $this->post(route('passkey.login'))->assertNotFound();
    });

    test('the login page offers only the IdP', function () {
        useOidc(only: true);

        $this->get(route('login'))->assertOk()->assertInertia(fn (Assert $page) => $page
            ->component('auth/login')
            ->where('oidc.only', true)
            ->where('canRegister', false)
            ->where('canResetPassword', false));
    });

    test('existing users log in through the IdP, linked by verified email', function () {
        useOidc(only: true);
        $user = User::factory()->create(['email' => 'ada@example.com']);

        oidcCallback(oidcIdentity())->assertRedirect(route('home'));

        $this->assertAuthenticatedAs($user);
    });

    test('a signed-in user can no longer set a password', function () {
        useOidc(only: true);
        $user = User::factory()->create();

        $this->actingAs($user)
            ->put(route('user-password.update'), [
                'current_password' => 'password',
                'password' => 'new-password',
                'password_confirmation' => 'new-password',
            ])
            ->assertNotFound();
    });

    test('it means nothing without a configured IdP', function () {
        config(['oidc.only' => true]);
        $user = User::factory()->create();

        $this->post(route('login.store'), ['email' => $user->email, 'password' => 'password']);
        $this->assertAuthenticatedAs($user);
    });
});
