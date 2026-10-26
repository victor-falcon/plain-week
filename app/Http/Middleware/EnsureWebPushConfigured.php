<?php

namespace App\Http\Middleware;

use App\Push\PushConfig;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Web Push exists only when the instance has VAPID keys (`VAPID_PUBLIC_KEY`,
 * `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`); elsewhere its routes are 404.
 */
class EnsureWebPushConfigured
{
    /**
     * @param  Closure(Request): Response  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        abort_unless(PushConfig::enabled(), 404);

        return $next($request);
    }
}
