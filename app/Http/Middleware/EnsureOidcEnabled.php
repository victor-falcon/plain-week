<?php

namespace App\Http\Middleware;

use App\Auth\Oidc\Oidc;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * The OIDC login routes are `404` unless the IdP is configured and `OIDC_ENABLED` is on (off by default in SaaS
 * mode).
 */
class EnsureOidcEnabled
{
    /**
     * @param  Closure(Request): Response  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        abort_unless(Oidc::enabled(), 404);

        return $next($request);
    }
}
