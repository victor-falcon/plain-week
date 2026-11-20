<?php

namespace App\Agents;

use App\Models\User;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Laravel\Passport\Client;
use Symfony\Component\HttpFoundation\Response;

/**
 * The OAuth consent card an MCP client (Claude, …) or a native app sends the user to: the
 * Inertia page `oauth/authorize`, with what it needs to post Passport's
 * approve and deny forms.
 */
final class AuthorizationPage
{
    /**
     * @param  array<string, mixed>  $parameters  Passport's: client, user, scopes, request, authToken
     */
    public static function render(array $parameters): Response
    {
        /** @var Client $client */
        $client = $parameters['client'];
        /** @var User $user */
        $user = $parameters['user'];
        /** @var Request $request */
        $request = $parameters['request'];

        $redirectUri = $request->query('redirect_uri');

        return Inertia::render('oauth/authorize', [
            'client' => [
                'id' => (string) $client->getKey(),
                'name' => $client->name,
            ],
            // Where the browser goes after Approve or Deny, so the user can tell a look-alike app.
            'redirectHost' => is_string($redirectUri) ? self::redirectTarget($redirectUri) : null,
            'account' => [
                'name' => $user->name,
                'email' => $user->email,
            ],
            'state' => $request->query('state'),
            'authToken' => $parameters['authToken'],
            // The forms are plain HTML posts (Passport answers with a redirect to the client), so they carry the token.
            'csrfToken' => csrf_token(),
        ])->toResponse($request);
    }

    /**
     * The host of a web or loopback redirect (`claude.ai`, `127.0.0.1`); a native app's private-use scheme keeps its
     * scheme (`plainweek://oauth`), since the host alone (`oauth`) says nothing.
     */
    private static function redirectTarget(string $redirectUri): ?string
    {
        $scheme = parse_url($redirectUri, PHP_URL_SCHEME);
        $host = parse_url($redirectUri, PHP_URL_HOST);

        if (! is_string($host) || $host === '') {
            return null;
        }

        return in_array($scheme, ['http', 'https'], true) ? $host : $scheme.'://'.$host;
    }
}
