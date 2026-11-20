<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Symfony\Component\HttpFoundation\Response;

/**
 * Turns Passport's redirect back to an OAuth client into a full page visit
 * when the request is an Inertia visit (the consent page reached right after
 * logging in): an Inertia visit can't follow a redirect to another site.
 */
class LeaveForOAuthClient
{
    /**
     * @param  Closure(Request): Response  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        $response = $next($request);

        if ($request->inertia() && $response instanceof RedirectResponse && ! $this->isLocal($response->getTargetUrl())) {
            return Inertia::location($response->getTargetUrl());
        }

        return $response;
    }

    private function isLocal(string $url): bool
    {
        return str_starts_with($url, rtrim(url('/'), '/').'/') || $url === url('/');
    }
}
