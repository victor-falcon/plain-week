<?php

namespace App\Http\Controllers\Settings;

use App\Agents\AgentAccess;
use App\Http\Controllers\Controller;
use App\Http\Middleware\AddResourceMetadataHeader;
use App\Mcp\McpConfig;
use App\Models\McpActivity;
use App\Models\User;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class AgentsController extends Controller
{
    public const int ACTIVITY_PER_PAGE = 20;

    public function __construct(private readonly AgentAccess $access) {}

    /**
     * Settings › Agents & apps: how to connect an AI agent to the MCP server
     * (null `mcpUrl` while MCP_ENABLED is off) or an app to the app API, the
     * personal access tokens, the connected OAuth apps and what agents changed
     * lately (newest first, ACTIVITY_PER_PAGE per page).
     */
    public function edit(Request $request): Response
    {
        $user = $this->user($request);

        return Inertia::render('settings/agents', [
            'mcpUrl' => McpConfig::enabled() ? route('mcp') : null,
            'api' => [
                'baseUrl' => url('/api/v1'),
                'resourceMetadataUrl' => AddResourceMetadataHeader::metadataUrl(),
                'authorizationServerMetadataUrl' => route('mcp.oauth.authorization-server'),
            ],
            'personalTokens' => $this->access->personalTokens($user),
            'oauthApps' => $this->access->oauthApps($user),
            'activity' => $this->activity($user),
        ]);
    }

    /**
     * One page of the activity log (`?activity_page=`). Entries past the retention are hidden even before the daily
     * prune removes them.
     *
     * @return array{entries: list<array{id: int, tool: string, summary: string, clientType: string, clientName: string, createdAt: string}>, previousPageUrl: string|null, nextPageUrl: string|null}
     */
    private function activity(User $user): array
    {
        $page = $user->mcpActivities()
            ->where('created_at', '>=', now()->subDays(McpActivity::RETENTION_DAYS))
            ->orderByDesc('id')
            ->simplePaginate(self::ACTIVITY_PER_PAGE, pageName: 'activity_page');

        return [
            'entries' => array_values(array_map(fn (McpActivity $activity): array => [
                'id' => $activity->id,
                'tool' => $activity->tool,
                'summary' => $activity->summary,
                'clientType' => $activity->client_type,
                'clientName' => $activity->client_name,
                'createdAt' => $activity->created_at->toIso8601String(),
            ], $page->items())),
            'previousPageUrl' => $page->previousPageUrl(),
            'nextPageUrl' => $page->nextPageUrl(),
        ];
    }

    /**
     * Creates a personal access token and shows it once (flash `newToken`).
     */
    public function storeToken(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:100'],
        ]);

        $token = $this->access->createPersonalToken($this->user($request), $validated['name']);

        Inertia::flash('newToken', ['name' => $validated['name'], 'token' => $token]);

        return to_route('agents.edit');
    }

    public function destroyToken(Request $request, string $token): RedirectResponse
    {
        // Idempotent: a second click or another tab finds it already gone.
        $this->access->revokePersonalToken($this->user($request), $token);

        Inertia::flash('toast', ['type' => 'success', 'message' => __('Token revoked.')]);

        return to_route('agents.edit');
    }

    public function destroyApp(Request $request, string $client): RedirectResponse
    {
        $this->access->revokeOAuthApp($this->user($request), $client);

        Inertia::flash('toast', ['type' => 'success', 'message' => __('App disconnected.')]);

        return to_route('agents.edit');
    }

    private function user(Request $request): User
    {
        /** @var User */
        return $request->user();
    }
}
