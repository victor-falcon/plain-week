<?php

namespace App\Http\Middleware;

use App\Auth\Registration;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Fortify's sign-up routes (`register`, `register.store`) are `404` while
 * registration is closed (`REGISTRATION_ENABLED=false` and at least one user).
 * The routes stay registered, so the generated route helpers keep working.
 */
class EnsureRegistrationOpen
{
    /**
     * @param  Closure(Request): Response  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        if ($request->routeIs('register', 'register.store')) {
            abort_unless(Registration::open(), 404);
        }

        return $next($request);
    }
}
