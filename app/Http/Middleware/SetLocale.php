<?php

namespace App\Http\Middleware;

use App\Models\User;
use App\Support\Translations;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\App;
use Symfony\Component\HttpFoundation\Response;

/**
 * Picks the request's language (App\Support\Translations::resolve): the account's choice, else the browser's, so
 * the HTML shell, the Inertia props and every server message (validation, flash toasts, emails) speak it.
 */
class SetLocale
{
    public function __construct(private readonly Translations $translations) {}

    /**
     * @param  Closure(Request): (Response)  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        App::setLocale($this->translations->resolve($request, $user instanceof User ? $user->language : null));

        $response = $next($request);

        // The page depends on the browser's languages (guests, and accounts on "Browser default").
        $response->headers->set('Vary', trim($response->headers->get('Vary', '').', Accept-Language', ', '));

        return $response;
    }
}
