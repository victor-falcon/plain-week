<?php

namespace App\Auth\Oidc;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;

/**
 * The IdP's discovery document (`<issuer>/.well-known/openid-configuration`) and its signing keys, each cached for
 * an hour. The document must name the configured issuer, so a misconfigured or spoofed URL is refused.
 */
final class OidcDiscovery
{
    private const int TTL = 3600;

    public function __construct(private readonly string $issuer) {}

    public function issuer(): string
    {
        return $this->issuer;
    }

    /**
     * An endpoint URL from the discovery document (`authorization_endpoint`, `token_endpoint`...), or null.
     */
    public function endpoint(string $name): ?string
    {
        $url = $this->document()[$name] ?? null;

        return is_string($url) && $url !== '' ? $url : null;
    }

    /**
     * @return list<string>
     */
    public function supported(string $name): array
    {
        $values = $this->document()[$name] ?? [];

        return is_array($values) ? array_values(array_filter($values, 'is_string')) : [];
    }

    /**
     * The JSON Web Key Set that signs ID tokens. `$refresh` skips the cache, after a key rotation.
     *
     * @return array<string, mixed>
     */
    public function jwks(bool $refresh = false): array
    {
        $key = $this->cacheKey('jwks');

        if ($refresh) {
            Cache::forget($key);
        }

        return Cache::remember($key, self::TTL, function (): array {
            $uri = $this->endpoint('jwks_uri') ?? throw new OidcException('The discovery document has no jwks_uri.');
            $jwks = Http::acceptJson()->timeout(10)->get($uri)->throw()->json();

            if (! is_array($jwks) || ! is_array($jwks['keys'] ?? null)) {
                throw new OidcException('The IdP returned no signing keys.');
            }

            return $jwks;
        });
    }

    /**
     * @return array<string, mixed>
     */
    private function document(): array
    {
        return Cache::remember($this->cacheKey('document'), self::TTL, function (): array {
            $document = Http::acceptJson()->timeout(10)
                ->get($this->issuer.'/.well-known/openid-configuration')
                ->throw()
                ->json();

            if (! is_array($document) || ! is_string($document['issuer'] ?? null)) {
                throw new OidcException('The IdP returned no discovery document.');
            }

            if (rtrim($document['issuer'], '/') !== $this->issuer) {
                throw new OidcException("The discovery document is for {$document['issuer']}, not {$this->issuer}.");
            }

            foreach (['authorization_endpoint', 'token_endpoint', 'jwks_uri'] as $required) {
                if (! is_string($document[$required] ?? null)) {
                    throw new OidcException("The discovery document has no {$required}.");
                }
            }

            return $document;
        });
    }

    private function cacheKey(string $what): string
    {
        return 'oidc.'.$what.'.'.hash('xxh3', $this->issuer);
    }
}
