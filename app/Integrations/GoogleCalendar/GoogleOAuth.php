<?php

namespace App\Integrations\GoogleCalendar;

use Carbon\CarbonImmutable;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\PendingRequest;
use Illuminate\Http\Client\RequestException;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;

/**
 * Google's OAuth 2.0 endpoints for a web server app: authorization code flow
 * with PKCE, offline access (a refresh token) and the calendar scope that only
 * reaches calendars this app created.
 */
class GoogleOAuth
{
    public const string CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.app.created';

    private const string AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth';

    private const string TOKEN_URL = 'https://oauth2.googleapis.com/token';

    private const string REVOKE_URL = 'https://oauth2.googleapis.com/revoke';

    /**
     * The integration exists only when the instance has OAuth credentials.
     */
    public static function configured(): bool
    {
        return filled(self::clientId()) && filled(self::clientSecret());
    }

    /**
     * Where to send the user to grant access. `prompt=consent` makes Google
     * hand out a refresh token on every connect, also on a reconnect.
     */
    public function authorizationUrl(string $state, string $codeVerifier): string
    {
        return self::AUTHORIZE_URL.'?'.http_build_query([
            'client_id' => self::clientId(),
            'redirect_uri' => $this->redirectUri(),
            'response_type' => 'code',
            'scope' => implode(' ', ['openid', 'email', self::CALENDAR_SCOPE]),
            'access_type' => 'offline',
            'prompt' => 'consent',
            'include_granted_scopes' => 'false',
            'state' => $state,
            'code_challenge' => $this->codeChallenge($codeVerifier),
            'code_challenge_method' => 'S256',
        ], arg_separator: '&', encoding_type: PHP_QUERY_RFC3986);
    }

    /**
     * @throws RequestException|ConnectionException
     */
    public function exchangeCode(string $code, string $codeVerifier): GoogleTokens
    {
        return $this->tokens($this->http()->asForm()->post(self::TOKEN_URL, [
            'client_id' => self::clientId(),
            'client_secret' => self::clientSecret(),
            'redirect_uri' => $this->redirectUri(),
            'grant_type' => 'authorization_code',
            'code' => $code,
            'code_verifier' => $codeVerifier,
        ])->throw());
    }

    /**
     * A fresh access token. A refused refresh token (`invalid_grant`) throws
     * {@see GoogleCalendarDisconnected}; anything else is transient.
     *
     * @throws GoogleCalendarDisconnected|RequestException|ConnectionException
     */
    public function refresh(string $refreshToken): GoogleTokens
    {
        $response = $this->http()->asForm()->post(self::TOKEN_URL, [
            'client_id' => self::clientId(),
            'client_secret' => self::clientSecret(),
            'grant_type' => 'refresh_token',
            'refresh_token' => $refreshToken,
        ]);

        if ($response->status() === 400 && $response->json('error') === GoogleCalendarDisconnected::INVALID_GRANT) {
            throw new GoogleCalendarDisconnected((string) ($response->json('error_description') ?? GoogleCalendarDisconnected::INVALID_GRANT));
        }

        return $this->tokens($response->throw());
    }

    /**
     * Revokes the grant (revoking the refresh token also ends its access
     * tokens). A token Google no longer knows is already revoked.
     *
     * @throws RequestException|ConnectionException
     */
    public function revoke(string $token): void
    {
        $response = $this->http()->asForm()->post(self::REVOKE_URL, ['token' => $token]);

        if ($response->status() !== 400) {
            $response->throw();
        }
    }

    public function redirectUri(): string
    {
        return route('integrations.google.callback');
    }

    private static function clientId(): ?string
    {
        $value = config('services.google.client_id');

        return is_string($value) ? $value : null;
    }

    private static function clientSecret(): ?string
    {
        $value = config('services.google.client_secret');

        return is_string($value) ? $value : null;
    }

    public function newCodeVerifier(): string
    {
        return Str::random(64);
    }

    private function codeChallenge(string $codeVerifier): string
    {
        return rtrim(strtr(base64_encode(hash('sha256', $codeVerifier, true)), '+/', '-_'), '=');
    }

    private function tokens(Response $response): GoogleTokens
    {
        $scope = $response->json('scope');
        $refreshToken = $response->json('refresh_token');

        return new GoogleTokens(
            accessToken: (string) $response->json('access_token'),
            refreshToken: is_string($refreshToken) && $refreshToken !== '' ? $refreshToken : null,
            expiresAt: CarbonImmutable::now()->addSeconds((int) $response->json('expires_in', 3600)),
            scopes: is_string($scope) ? array_values(array_filter(explode(' ', $scope))) : [],
            email: $this->email($response->json('id_token')),
        );
    }

    /**
     * The account's email from the ID token. It comes straight from Google's
     * token endpoint over TLS, so its signature does not need checking.
     */
    private function email(mixed $idToken): ?string
    {
        if (! is_string($idToken) || substr_count($idToken, '.') !== 2) {
            return null;
        }

        $claims = json_decode((string) base64_decode(strtr(explode('.', $idToken)[1], '-_', '+/')), true);
        $email = is_array($claims) ? ($claims['email'] ?? null) : null;

        return is_string($email) && $email !== '' ? $email : null;
    }

    private function http(): PendingRequest
    {
        return Http::acceptJson()->connectTimeout(5)->timeout(15);
    }
}
