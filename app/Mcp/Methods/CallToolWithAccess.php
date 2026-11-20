<?php

namespace App\Mcp\Methods;

use App\Mcp\Tools\AvailableWithoutPlan;
use App\Models\User;
use Generator;
use Laravel\Mcp\Server\Methods\CallTool;
use Laravel\Mcp\Server\ServerContext;
use Laravel\Mcp\Transport\JsonRpcRequest;
use Laravel\Mcp\Transport\JsonRpcResponse;

/**
 * `tools/call` behind the same entitlement as sync (`User::hasAccess()`, see
 * EnsureHasAccess): in SaaS mode an account without a paid plan gets a tool
 * error (`isError: true`) the agent can relay, with the link to the plans.
 * Listing tools stays open, so an agent can still connect and explain it.
 */
class CallToolWithAccess extends CallTool
{
    public function handle(JsonRpcRequest $request, ServerContext $context): Generator|JsonRpcResponse
    {
        $user = auth()->user();
        $tool = $context->tools()->first(fn ($tool): bool => $tool->name() === $request->get('name'));

        if ($user instanceof User && ! $user->hasAccess() && $tool !== null && ! $tool instanceof AvailableWithoutPlan) {
            return JsonRpcResponse::result($request->id, [
                'content' => [[
                    'type' => 'text',
                    'text' => self::planRequiredMessage(),
                ]],
                'isError' => true,
            ]);
        }

        return parent::handle($request, $context);
    }

    public static function planRequiredMessage(): string
    {
        return 'Plain Week needs a paid plan to use your planner from an AI agent. Choose a plan at '
            .route('billing.plans').' and try again.';
    }
}
