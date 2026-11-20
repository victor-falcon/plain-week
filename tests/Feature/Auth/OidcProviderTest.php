<?php

use App\Models\User;
use Firebase\JWT\JWT;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;

/*
 * The real `oidc` driver (no Socialite fake) against a fake IdP: discovery, PKCE, state and nonce, and the checks
 * on the ID token.
 */

uses(RefreshDatabase::class);

function base64url(string $bytes): string
{
    return rtrim(strtr(base64_encode($bytes), '+/', '-_'), '=');
}

/**
 * @return array{private: string, jwk: array<string, string>}
 */
function idpKey(string $kid = 'key-1'): array
{
    static $keys = [];

    if (! isset($keys[$kid])) {
        $key = openssl_pkey_new(['private_key_bits' => 2048, 'private_key_type' => OPENSSL_KEYTYPE_RSA]);
        openssl_pkey_export($key, $private);
        $rsa = openssl_pkey_get_details($key)['rsa'];
        $keys[$kid] = [
            'private' => $private,
            'jwk' => ['kty' => 'RSA', 'kid' => $kid, 'use' => 'sig', 'alg' => 'RS256', 'n' => base64url($rsa['n']), 'e' => base64url($rsa['e'])],
        ];
    }

    return $keys[$kid];
}

/**
 * Starts a login at /auth/oidc/redirect and returns the authorization request's query.
 *
 * @return array<string, string>
 */
function startOidcLogin(): array
{
    $location = test()->get(route('oidc.redirect'))->assertRedirect()->headers->get('Location');
    expect($location)->toStartWith('https://idp.test/authorize?');
    parse_str((string) parse_url($location, PHP_URL_QUERY), $query);

    return $query;
}

/**
 * Fakes the IdP; `$idToken` builds the ID token from the authorization request's nonce.
 *
 * @param  Closure(string $nonce): string  $idToken
 * @param  array<string, mixed>  $userinfo
 */
function fakeIdp(Closure $idToken, array $userinfo = [], array $jwks = []): void
{
    Http::fake([
        'https://idp.test/.well-known/openid-configuration' => [
            'issuer' => 'https://idp.test',
            'authorization_endpoint' => 'https://idp.test/authorize',
            'token_endpoint' => 'https://idp.test/token',
            'userinfo_endpoint' => 'https://idp.test/userinfo',
            'jwks_uri' => 'https://idp.test/jwks',
            'id_token_signing_alg_values_supported' => ['RS256'],
        ],
        'https://idp.test/jwks' => ['keys' => $jwks ?: [idpKey()['jwk']]],
        'https://idp.test/token' => fn () => Http::response([
            'access_token' => 'access-token',
            'token_type' => 'Bearer',
            'id_token' => $idToken((string) session('oidc.nonce')),
        ]),
        'https://idp.test/userinfo' => ['sub' => 'idp-user-1', 'email' => 'ada@example.com', 'email_verified' => true, 'name' => 'Ada Lovelace', ...$userinfo],
    ]);
}

/**
 * @param  array<string, mixed>  $claims
 */
function signedIdToken(string $nonce, array $claims = [], string $kid = 'key-1'): string
{
    return JWT::encode([
        'iss' => 'https://idp.test',
        'aud' => 'plain-week',
        'sub' => 'idp-user-1',
        'nonce' => $nonce,
        'iat' => time(),
        'exp' => time() + 300,
        ...$claims,
    ], idpKey($kid)['private'], 'RS256', $kid);
}

beforeEach(fn () => useOidc());

test('the authorization request uses PKCE, state, a nonce and the OpenID scopes', function () {
    fakeIdp(fn (string $nonce) => signedIdToken($nonce));

    $query = startOidcLogin();

    expect($query)->toMatchArray([
        'client_id' => 'plain-week',
        'redirect_uri' => route('oidc.callback'),
        'response_type' => 'code',
        'scope' => 'openid email profile',
        'code_challenge_method' => 'S256',
        'state' => session('state'),
        'nonce' => session('oidc.nonce'),
    ])->and($query['code_challenge'])->toBe(base64url(hash('sha256', session('code_verifier'), true)));
    expect($query)->not->toHaveKey('prompt');
});

test('a valid ID token logs the user in; the code goes with the PKCE verifier and client credentials', function () {
    fakeIdp(fn (string $nonce) => signedIdToken($nonce));
    $query = startOidcLogin();
    $verifier = session('code_verifier');

    $this->get(route('oidc.callback', ['code' => 'the-code', 'state' => $query['state']]))->assertRedirect(route('home'));

    $user = User::query()->sole();
    $this->assertAuthenticatedAs($user);
    expect($user->oidc_sub)->toBe('idp-user-1')->and($user->email)->toBe('ada@example.com');

    Http::assertSent(fn (Request $request) => $request->url() === 'https://idp.test/token'
        && $request['code'] === 'the-code'
        && $request['code_verifier'] === $verifier
        && ! isset($request['client_secret'])
        && $request->hasHeader('Authorization', 'Basic '.base64_encode('plain-week:client-secret')));
});

test('a forged state is refused before talking to the IdP', function () {
    fakeIdp(fn (string $nonce) => signedIdToken($nonce));
    startOidcLogin();

    $this->get(route('oidc.callback', ['code' => 'the-code', 'state' => 'forged']))
        ->assertRedirect(route('login'))
        ->assertSessionHas('oidcError', 'failed');

    $this->assertGuest();
    Http::assertNotSent(fn (Request $request) => $request->url() === 'https://idp.test/token');
});

test('a bad ID token is refused', function (Closure $idToken) {
    fakeIdp($idToken);
    $query = startOidcLogin();

    $this->get(route('oidc.callback', ['code' => 'the-code', 'state' => $query['state']]))
        ->assertRedirect(route('login'))
        ->assertSessionHas('oidcError', 'failed');

    $this->assertGuest();
    expect(User::query()->count())->toBe(0);
})->with([
    'another nonce' => [fn (string $nonce) => signedIdToken('replayed')],
    'another audience' => [fn (string $nonce) => signedIdToken($nonce, ['aud' => 'another-app'])],
    'another issuer' => [fn (string $nonce) => signedIdToken($nonce, ['iss' => 'https://evil.test'])],
    'expired' => [fn (string $nonce) => signedIdToken($nonce, ['exp' => time() - 3600])],
    'several audiences, no azp' => [fn (string $nonce) => signedIdToken($nonce, ['aud' => ['plain-week', 'other']])],
    'signed with an unknown key' => [fn (string $nonce) => signedIdToken($nonce, kid: 'rogue')],
    'unsigned (alg none)' => [fn (string $nonce) => base64url('{"alg":"none","typ":"JWT"}').'.'.base64url((string) json_encode([
        'iss' => 'https://idp.test', 'aud' => 'plain-week', 'sub' => 'idp-user-1', 'nonce' => $nonce, 'exp' => time() + 300,
    ])).'.'],
    'missing' => [fn (string $nonce) => ''],
]);

test('a userinfo response for another subject is refused', function () {
    fakeIdp(fn (string $nonce) => signedIdToken($nonce), userinfo: ['sub' => 'someone-else']);
    $query = startOidcLogin();

    $this->get(route('oidc.callback', ['code' => 'the-code', 'state' => $query['state']]))
        ->assertSessionHas('oidcError', 'failed');

    $this->assertGuest();
});

test('the verified email comes from the IdP claims', function () {
    $user = User::factory()->create(['email' => 'ada@example.com']);
    fakeIdp(fn (string $nonce) => signedIdToken($nonce), userinfo: ['email_verified' => false]);
    $query = startOidcLogin();

    $this->get(route('oidc.callback', ['code' => 'the-code', 'state' => $query['state']]))
        ->assertSessionHas('oidcError', 'unverified_email');

    $this->assertGuest();
    expect($user->fresh()->oidc_sub)->toBeNull();
});

test('a discovery document for another issuer is refused', function () {
    Http::fake(['https://idp.test/.well-known/openid-configuration' => [
        'issuer' => 'https://evil.test',
        'authorization_endpoint' => 'https://evil.test/authorize',
        'token_endpoint' => 'https://evil.test/token',
        'jwks_uri' => 'https://evil.test/jwks',
    ]]);

    $this->get(route('oidc.redirect'))
        ->assertRedirect(route('login'))
        ->assertSessionHas('oidcError', 'failed');
});
