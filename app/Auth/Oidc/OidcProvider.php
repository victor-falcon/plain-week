<?php

namespace App\Auth\Oidc;

use Firebase\JWT\JWK;
use Firebase\JWT\JWT;
use Firebase\JWT\Key;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use Laravel\Socialite\Two\AbstractProvider;
use Laravel\Socialite\Two\InvalidStateException;
use Laravel\Socialite\Two\User;
use Throwable;
use UnexpectedValueException;

/**
 * A generic OpenID Connect provider for Socialite: the authorization code flow with PKCE (S256), `state` and a
 * `nonce`, endpoints from the IdP's discovery document. The ID token from the token endpoint is verified (signature
 * against the IdP's JWKS, `iss`, `aud`/`azp`, `exp`, `nonce`) and is the source of `sub`; the userinfo endpoint,
 * when the IdP has one, adds the profile claims (`email`, `email_verified`, `name`).
 */
class OidcProvider extends AbstractProvider
{
    /** Seconds of clock skew allowed when checking `exp`, `iat` and `nbf`. */
    private const int LEEWAY = 60;

    /** @var list<string> */
    protected $scopes = ['openid', 'email', 'profile'];

    protected $scopeSeparator = ' ';

    protected $usesPKCE = true;

    private OidcDiscovery $discovery;

    public function setDiscovery(OidcDiscovery $discovery): static
    {
        $this->discovery = $discovery;

        return $this;
    }

    public function redirect()
    {
        // Bound to this browser's session and checked against the ID token, so a token can't be replayed.
        $this->request->session()->put('oidc.nonce', $nonce = Str::random(40));
        $this->parameters['nonce'] = $nonce;

        return parent::redirect();
    }

    protected function getAuthUrl($state)
    {
        return $this->buildAuthUrlFromBase($this->requiredEndpoint('authorization_endpoint'), $state);
    }

    protected function getTokenUrl()
    {
        return $this->requiredEndpoint('token_endpoint');
    }

    public function user()
    {
        if ($this->user) {
            return $this->user;
        }

        if ($this->hasInvalidState()) {
            throw new InvalidStateException;
        }

        $response = $this->getAccessTokenResponse($this->getCode());
        $claims = $this->verifyIdToken(Arr::get($response, 'id_token'));

        $accessToken = Arr::get($response, 'access_token');
        $userinfo = is_string($accessToken) && $this->discovery->endpoint('userinfo_endpoint') !== null
            ? $this->getUserByToken($accessToken)
            : [];

        // OIDC Core 5.3.2: the userinfo `sub` must be the ID token's, or the response is not about this user.
        if (isset($userinfo['sub']) && $userinfo['sub'] !== $claims['sub']) {
            throw new OidcException('The userinfo response is for another subject.');
        }

        return $this->userInstance($response, [...$claims, ...$userinfo, 'sub' => $claims['sub']]);
    }

    /**
     * @param  string  $code
     * @return array<string, mixed>
     */
    public function getAccessTokenResponse($code)
    {
        $request = Http::acceptJson()->asForm()->timeout(10);
        $fields = $this->getTokenFields($code);

        // A confidential client uses client_secret_basic unless the IdP only takes client_secret_post. A public
        // client (no secret) sends only its id; PKCE protects the code.
        unset($fields['client_secret']);

        if (filled($this->clientSecret)) {
            $methods = $this->discovery->supported('token_endpoint_auth_methods_supported');

            if (in_array('client_secret_post', $methods, true) && ! in_array('client_secret_basic', $methods, true)) {
                $fields['client_secret'] = $this->clientSecret;
            } else {
                $request = $request->withBasicAuth(urlencode($this->clientId), urlencode($this->clientSecret));
            }
        }

        $response = $request->post($this->getTokenUrl(), $fields)->throw()->json();

        if (! is_array($response)) {
            throw new OidcException('The token endpoint returned no JSON.');
        }

        return $response;
    }

    /**
     * @param  string  $token
     * @return array<string, mixed>
     */
    protected function getUserByToken($token)
    {
        $endpoint = $this->requiredEndpoint('userinfo_endpoint');
        $userinfo = Http::acceptJson()->timeout(10)->withToken($token)->get($endpoint)->throw()->json();

        return is_array($userinfo) ? $userinfo : [];
    }

    /**
     * @param  array<string, mixed>  $user
     */
    protected function mapUserToObject(array $user)
    {
        $name = $user['name'] ?? trim(($user['given_name'] ?? '').' '.($user['family_name'] ?? ''));

        return (new User)->setRaw($user)->map([
            'id' => (string) $user['sub'],
            'email' => is_string($user['email'] ?? null) ? $user['email'] : null,
            'name' => is_string($name) && $name !== '' ? $name : ($user['preferred_username'] ?? null),
            'nickname' => $user['preferred_username'] ?? null,
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    private function verifyIdToken(mixed $idToken): array
    {
        if (! is_string($idToken) || $idToken === '') {
            throw new OidcException('The token response has no id_token.');
        }

        $claims = $this->decode($idToken);

        if (rtrim((string) ($claims['iss'] ?? ''), '/') !== $this->discovery->issuer()) {
            throw new OidcException('The ID token was issued by another issuer.');
        }

        $audience = (array) ($claims['aud'] ?? []);

        if (! in_array($this->clientId, $audience, true)) {
            throw new OidcException('The ID token is for another client.');
        }

        if (count($audience) > 1 && ($claims['azp'] ?? null) !== $this->clientId) {
            throw new OidcException('The ID token was issued to another party.');
        }

        $nonce = $this->request->session()->pull('oidc.nonce');

        if (! is_string($nonce) || ! is_string($claims['nonce'] ?? null) || ! hash_equals($nonce, $claims['nonce'])) {
            throw new OidcException('The ID token nonce does not match this login.');
        }

        if (! is_string($claims['sub'] ?? null) || $claims['sub'] === '') {
            throw new OidcException('The ID token has no subject.');
        }

        return $claims;
    }

    /**
     * Verifies the signature (and `exp`, `iat`, `nbf`) and returns the claims. An unknown key id refreshes the
     * cached key set once, for a key the IdP rotated in since.
     *
     * @return array<string, mixed>
     */
    private function decode(string $idToken): array
    {
        $previousLeeway = JWT::$leeway;
        JWT::$leeway = self::LEEWAY;

        try {
            try {
                $payload = JWT::decode($idToken, $this->keys(refresh: false));
            } catch (UnexpectedValueException $e) {
                if (! str_contains($e->getMessage(), '"kid"')) {
                    throw $e;
                }

                $payload = JWT::decode($idToken, $this->keys(refresh: true));
            }
        } catch (OidcException $e) {
            throw $e;
        } catch (Throwable $e) {
            throw new OidcException('The ID token is invalid: '.$e->getMessage(), previous: $e);
        } finally {
            JWT::$leeway = $previousLeeway;
        }

        return json_decode((string) json_encode($payload), true);
    }

    /**
     * @return array<string, Key>
     */
    private function keys(bool $refresh): array
    {
        // The algorithm for keys that don't name theirs: the IdP's first asymmetric one. `none` and the HMAC ones
        // (signed with the client secret) are never accepted.
        $algorithm = collect($this->discovery->supported('id_token_signing_alg_values_supported'))
            ->first(fn (string $alg) => $alg !== 'none' && ! str_starts_with($alg, 'HS')) ?? 'RS256';

        return JWK::parseKeySet($this->discovery->jwks($refresh), $algorithm);
    }

    private function requiredEndpoint(string $name): string
    {
        return $this->discovery->endpoint($name) ?? throw new OidcException("The discovery document has no {$name}.");
    }
}
