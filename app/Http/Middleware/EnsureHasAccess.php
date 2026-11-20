<?php

namespace App\Http\Middleware;

use App\Models\User;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * In SaaS mode a signed-in user without a paid plan gets the paywall: JSON
 * requests (sync, the app API) a `402 Payment Required`, pages a redirect. Guests and
 * self-hosted instances pass through.
 */
class EnsureHasAccess
{
    /**
     * @param  Closure(Request): Response  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if (! $user instanceof User || $user->hasAccess()) {
            return $next($request);
        }

        // Inertia visits also expect JSON, but they follow redirects. The app API never redirects, whatever it accepts.
        if (($request->expectsJson() && ! $request->inertia()) || $request->is('api/*')) {
            abort(402, 'A paid plan is required to sync.');
        }

        return redirect()->route('billing.plans');
    }
}
