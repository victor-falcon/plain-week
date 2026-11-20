<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Points a `401` from the app API at its protected resource metadata (RFC 9728 §5.1), the way `/mcp` does, so an
 * OAuth client can discover the authorization server from a failed call.
 */
class AddResourceMetadataHeader
{
    /** The protected resource the app API's routes belong to (its metadata lives under this path). */
    public const string RESOURCE_PATH = 'api/v1';

    /**
     * @param  Closure(Request): Response  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        $response = $next($request);

        if ($response->getStatusCode() === 401) {
            $response->headers->set(
                'WWW-Authenticate',
                'Bearer realm="plain-week", resource_metadata="'.self::metadataUrl().'"',
            );
        }

        return $response;
    }

    public static function metadataUrl(): string
    {
        return url('/.well-known/oauth-protected-resource/'.self::RESOURCE_PATH);
    }
}
