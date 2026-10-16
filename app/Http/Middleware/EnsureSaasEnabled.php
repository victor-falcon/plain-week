<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Billing and legal routes exist only in SaaS mode; elsewhere they are 404.
 */
class EnsureSaasEnabled
{
    /**
     * @param  Closure(Request): Response  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        abort_unless(config('saas.enabled'), 404);

        return $next($request);
    }
}
