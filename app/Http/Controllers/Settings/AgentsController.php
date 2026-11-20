<?php

namespace App\Http\Controllers\Settings;

use App\Agents\AgentAccess;
use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class AgentsController extends Controller
{
    public function __construct(private readonly AgentAccess $access) {}

    /**
     * Settings › Agents: how to connect an AI agent to the MCP server, the
     * personal access tokens and the connected OAuth apps.
     */
    public function edit(Request $request): Response
    {
        $user = $this->user($request);

        return Inertia::render('settings/agents', [
            'mcpUrl' => route('mcp'),
            'personalTokens' => $this->access->personalTokens($user),
            'oauthApps' => $this->access->oauthApps($user),
        ]);
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
        abort_unless($this->access->revokePersonalToken($this->user($request), $token), 404);

        Inertia::flash('toast', ['type' => 'success', 'message' => __('Token revoked.')]);

        return to_route('agents.edit');
    }

    public function destroyApp(Request $request, string $client): RedirectResponse
    {
        abort_unless($this->access->revokeOAuthApp($this->user($request), $client), 404);

        Inertia::flash('toast', ['type' => 'success', 'message' => __('App disconnected.')]);

        return to_route('agents.edit');
    }

    private function user(Request $request): User
    {
        /** @var User */
        return $request->user();
    }
}
