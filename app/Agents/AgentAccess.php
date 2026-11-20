<?php

namespace App\Agents;

use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Date;
use Illuminate\Support\Facades\DB;
use Laravel\Mcp\Server\Registrar;
use Laravel\Passport\AccessToken;
use Laravel\Passport\Client;
use Laravel\Passport\ClientRepository;
use Laravel\Passport\Passport;
use Laravel\Passport\Token;
use RuntimeException;

/**
 * What can reach a user's planner through the MCP server and the app API:
 * personal access tokens (headless agents, scripts, Bearer) and OAuth apps
 * (claude.ai, Claude Desktop, native apps, …). Both are Passport access tokens; a personal token belongs to
 * the instance's personal access client, an OAuth app is the client a
 * connector registered for itself.
 */
final class AgentAccess
{
    /** The Passport client personal access tokens are issued by (created on first use). */
    private const string PERSONAL_CLIENT_NAME = 'Plain Week personal access tokens';

    public function __construct(private readonly ClientRepository $clients) {}

    /**
     * Issues a personal access token. The plain token exists only in the
     * return value: Passport stores its id, never the token.
     */
    public function createPersonalToken(User $user, string $name): string
    {
        $this->ensurePersonalAccessClient();

        return $user->createToken($name, [Registrar::OAUTH_SCOPE])->accessToken;
    }

    /**
     * @return Collection<int, array{id: string, name: string, createdAt: string|null, lastUsedAt: string|null}>
     */
    public function personalTokens(User $user): Collection
    {
        return $this->personalTokenQuery($user)
            ->latest()
            ->get()
            ->map(fn (Token $token): array => [
                'id' => (string) $token->getKey(),
                'name' => (string) $token->name,
                'createdAt' => $token->created_at?->toIso8601String(),
                'lastUsedAt' => self::iso($token->getAttribute('last_used_at')),
            ])
            ->values();
    }

    /**
     * Only ever one of the user's own tokens; false when there was none.
     */
    public function revokePersonalToken(User $user, string $tokenId): bool
    {
        return $this->personalTokenQuery($user)
            ->whereKey($tokenId)
            ->delete() > 0;
    }

    /**
     * The OAuth apps that can still act for the user: an access token that
     * has not expired, or a refresh token that can get a new one.
     *
     * @return Collection<int, array{id: string, name: string, createdAt: string|null, lastUsedAt: string|null}>
     */
    public function oauthApps(User $user): Collection
    {
        $now = Date::now();

        return $this->oauthTokenQuery($user)
            ->where('revoked', false)
            ->where(fn (Builder $query) => $query
                ->where('expires_at', '>', $now)
                ->orWhereHas('refreshToken', fn (Builder $refresh) => $refresh->where('revoked', false)->where('expires_at', '>', $now)))
            ->with('client')
            ->get()
            ->groupBy('client_id')
            ->map(function (Collection $tokens): array {
                /** @var Token $first */
                $first = $tokens->sortBy('created_at')->first();
                /** @var Client $client */
                $client = $first->client;

                return [
                    'id' => (string) $client->getKey(),
                    'name' => $client->name,
                    'createdAt' => $first->created_at?->toIso8601String(),
                    'lastUsedAt' => self::iso($tokens->max(fn (Token $token) => $token->getAttribute('last_used_at'))),
                ];
            })
            ->sortByDesc('createdAt')
            ->values();
    }

    /**
     * Disconnects an OAuth app: its access tokens (and with them their
     * refresh tokens) and pending authorization codes are deleted, so the app
     * has to ask for consent again.
     */
    public function revokeOAuthApp(User $user, string $clientId): bool
    {
        return DB::transaction(function () use ($user, $clientId): bool {
            Passport::authCode()->newQuery()
                ->where('user_id', $user->getKey())
                ->where('client_id', $clientId)
                ->delete();

            return $this->oauthTokenQuery($user)
                ->where('client_id', $clientId)
                ->delete() > 0;
        });
    }

    /**
     * The client behind the access token of the current request: a personal token or an OAuth app.
     *
     * @param  AccessToken<mixed>  $token
     */
    public function clientOf(AccessToken $token): AgentClient
    {
        /** @var Client|null $client */
        $client = Passport::client()->newQuery()->find($token->oauth_client_id);

        if ($client !== null && $client->hasGrantType('personal_access')) {
            $name = Passport::token()->newQuery()->whereKey($token->oauth_access_token_id)->value('name');

            return new AgentClient(AgentClient::TOKEN, $token->oauth_access_token_id, is_string($name) ? $name : 'Personal token');
        }

        return new AgentClient(AgentClient::OAUTH, $token->oauth_client_id, $client->name ?? 'OAuth app');
    }

    /**
     * The user's personal tokens that still work.
     *
     * @return Builder<Token>
     */
    private function personalTokenQuery(User $user): Builder
    {
        return Passport::token()->newQuery()
            ->where('user_id', $user->getKey())
            ->where('revoked', false)
            ->where('expires_at', '>', Date::now())
            ->whereHas('client', fn (Builder $query) => $query->whereJsonContains('grant_types', 'personal_access'));
    }

    /**
     * Every token the user's OAuth apps were given, whatever its state.
     *
     * @return Builder<Token>
     */
    private function oauthTokenQuery(User $user): Builder
    {
        return Passport::token()->newQuery()
            ->where('user_id', $user->getKey())
            ->whereHas('client', fn (Builder $query) => $query->whereJsonDoesntContain('grant_types', 'personal_access'));
    }

    private function ensurePersonalAccessClient(): void
    {
        try {
            $this->clients->personalAccessClient(config()->string('auth.guards.api.provider'));
        } catch (RuntimeException) {
            $this->clients->createPersonalAccessGrantClient(self::PERSONAL_CLIENT_NAME, config()->string('auth.guards.api.provider'));
        }
    }

    private static function iso(mixed $value): ?string
    {
        return $value === null ? null : Date::parse($value)->toIso8601String();
    }
}
