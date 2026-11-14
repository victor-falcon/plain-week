<?php

namespace App\Http\Middleware;

use App\Models\ApiToken;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Authenticates a native app by the Bearer token of routes/api.php: the token is
 * looked up by its SHA-256 hash, must not be expired, and its owner becomes the
 * request's user (the same `$request->user()` the web session provides). The
 * matched token row is put on the request as `api_token`, so `DELETE
 * /api/v1/tokens` can revoke exactly it. Anything else gets a 401.
 */
class AuthenticateApiToken
{
    /**
     * @param  Closure(Request): Response  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        $plain = $request->bearerToken();

        $apiToken = is_string($plain) && $plain !== ''
            ? ApiToken::query()->where('token_hash', ApiToken::hash($plain))->first()
            : null;

        if ($apiToken === null || ! $apiToken->isUsable()) {
            return response()->json(['message' => 'Unauthenticated.'], 401);
        }

        $request->setUserResolver(fn () => $apiToken->user);
        $request->attributes->set('api_token', $apiToken);
        $apiToken->touchLastUsed();

        return $next($request);
    }
}
