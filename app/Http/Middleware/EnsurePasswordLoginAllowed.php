<?php

namespace App\Http\Middleware;

use App\Auth\Oidc\Oidc;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * With `OIDC_ONLY=true` the IdP is the only way in: password login, the sign-up form, password reset, passkey login
 * and setting a password in Settings › Security are `404`. The routes stay registered, so the generated route helpers
 * keep working. Two-factor, the confirm-password step and managing passkeys are untouched.
 */
class EnsurePasswordLoginAllowed
{
    /** @var list<string> */
    public const array ROUTES = [
        'login.store',
        'register',
        'register.store',
        'password.request',
        'password.email',
        'password.reset',
        'password.update',
        'passkey.login',
        'passkey.login-options',
        'user-password.update',
    ];

    /**
     * @param  Closure(Request): Response  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        if (Oidc::only() && $request->routeIs(...self::ROUTES)) {
            abort(404);
        }

        return $next($request);
    }
}
