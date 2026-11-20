<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Date;
use Laravel\Passport\AccessToken;
use Laravel\Passport\Passport;
use Symfony\Component\HttpFoundation\Response;

/**
 * Records when the request's Bearer token was last used (Settings › Agents
 * shows it), at most once a minute per token so an agent's burst of calls
 * costs one write.
 */
class TouchAccessToken
{
    /**
     * @param  Closure(Request): Response  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        $token = $request->user()?->token();

        if ($token instanceof AccessToken) {
            $now = Date::now();

            Passport::token()->newQuery()
                ->whereKey($token->oauth_access_token_id)
                ->where(fn ($query) => $query->whereNull('last_used_at')->orWhere('last_used_at', '<', $now->subMinute()))
                ->update(['last_used_at' => $now]);
        }

        return $next($request);
    }
}
