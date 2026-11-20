<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Date;
use Laravel\Passport\AccessToken;
use Laravel\Passport\Passport;
use Symfony\Component\HttpFoundation\Response;

/**
 * Records when the request's Bearer token was last used (Settings › Agents &
 * apps shows it), on `/mcp` and the app API, at most once a minute per token
 * so a burst of calls costs one write.
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
            $staleBefore = $now->subMinute();

            Passport::token()->newQuery()
                ->whereKey($token->oauth_access_token_id)
                ->where(fn (Builder $query) => $query->whereNull('last_used_at')->orWhere('last_used_at', '<', $staleBefore))
                ->update(['last_used_at' => $now]);
        }

        return $next($request);
    }
}
