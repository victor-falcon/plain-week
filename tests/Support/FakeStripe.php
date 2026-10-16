<?php

namespace Tests\Support;

use Closure;
use RuntimeException;
use Stripe\ApiRequestor;
use Stripe\HttpClient\ClientInterface;

/**
 * Replaces Stripe's HTTP client: answers registered routes with canned JSON
 * and records every request, so tests never reach the network.
 */
class FakeStripe implements ClientInterface
{
    /** @var array<string, array<string, mixed>|Closure(array<string, mixed>): array<string, mixed>> */
    private array $routes = [];

    /** @var list<array{method: string, path: string, params: array<string, mixed>}> */
    public array $requests = [];

    public static function install(): self
    {
        $fake = new self;
        ApiRequestor::setHttpClient($fake);

        return $fake;
    }

    public static function uninstall(): void
    {
        ApiRequestor::setHttpClient(null);
    }

    /**
     * @param  array<string, mixed>|Closure(array<string, mixed>): array<string, mixed>  $response
     */
    public function on(string $method, string $path, array|Closure $response): self
    {
        $this->routes["{$method} {$path}"] = $response;

        return $this;
    }

    /**
     * @return array<string, mixed>|null The params of the last request to the route.
     */
    public function lastRequest(string $method, string $path): ?array
    {
        foreach (array_reverse($this->requests) as $request) {
            if ($request['method'] === $method && $request['path'] === $path) {
                return $request['params'];
            }
        }

        return null;
    }

    public function request($method, $absUrl, $headers, $params, $hasFile, $apiMode = 'v1', $maxNetworkRetries = null)
    {
        $path = (string) parse_url($absUrl, PHP_URL_PATH);
        $query = [];
        parse_str((string) parse_url($absUrl, PHP_URL_QUERY), $query);
        $params = [...$query, ...$params];

        $this->requests[] = ['method' => $method, 'path' => $path, 'params' => $params];

        $response = $this->routes["{$method} {$path}"]
            ?? throw new RuntimeException("Unexpected Stripe request: {$method} {$path}");

        $body = $response instanceof Closure ? $response($params) : $response;

        return [json_encode($body), 200, []];
    }
}
