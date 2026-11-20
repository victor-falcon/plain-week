<?php

namespace App\Agents;

use App\Models\User;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Laravel\Passport\Client;
use Symfony\Component\HttpFoundation\Response;

/**
 * The OAuth consent card an MCP client (Claude, …) sends the user to: the
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
        $redirectHost = is_string($redirectUri) ? parse_url($redirectUri, PHP_URL_HOST) : null;

        return Inertia::render('oauth/authorize', [
            'client' => [
                'id' => (string) $client->getKey(),
                'name' => $client->name,
            ],
            // Where the browser goes after Approve or Deny, so the user can tell a look-alike app.
            'redirectHost' => is_string($redirectHost) ? $redirectHost : null,
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
}
