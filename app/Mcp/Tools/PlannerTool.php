<?php

namespace App\Mcp\Tools;

use App\Agents\AgentAccess;
use App\Agents\AgentClient;
use App\Mcp\Support\Planner;
use App\Mcp\Support\WriteResult;
use App\Models\McpActivity;
use App\Models\User;
use App\Tasks\TaskDomainException;
use Illuminate\JsonSchema\JsonSchemaTypeFactory;
use Illuminate\Support\Facades\DB;
use Laravel\Mcp\Request;
use Laravel\Mcp\Response;
use Laravel\Mcp\ResponseFactory;
use Laravel\Mcp\Server\Tool;
use Laravel\Mcp\Server\Tools\Annotations\IsReadOnly;
use Laravel\Passport\AccessToken;

/**
 * A tool over the signed-in user's planner (see docs/architecture.md#mcp-tools). It refuses arguments its schema does
 * not declare, turns the domain's errors ({@see TaskDomainException}, validation) into tool errors the agent can relay,
 * and returns structured content. A write tool (one without {@see IsReadOnly}) runs in one transaction with its
 * activity log entry ({@see McpActivity}), so a failed call changes nothing and logs nothing.
 */
abstract class PlannerTool extends Tool
{
    /**
     * @return array<string, mixed>|WriteResult
     */
    abstract protected function run(Request $request, Planner $planner): array|WriteResult;

    public function handle(Request $request, AgentAccess $access): Response|ResponseFactory
    {
        $allowed = array_keys($this->schema(new JsonSchemaTypeFactory));
        $unknown = array_diff(array_keys($request->all()), $allowed);

        if ($unknown !== []) {
            return Response::error('Unknown argument'.(count($unknown) > 1 ? 's' : '').': '.implode(', ', $unknown).'. '
                .($allowed === [] ? 'This tool takes no arguments.' : 'This tool takes: '.implode(', ', $allowed).'.'));
        }

        /** @var User $user */
        $user = $request->user();
        $planner = new Planner($user);

        try {
            $result = $this->isReadOnly()
                ? $this->run($request, $planner)
                : DB::transaction(function () use ($request, $planner, $access, $user) {
                    $result = $this->run($request, $planner);

                    if ($result instanceof WriteResult) {
                        McpActivity::record($user, $this->client($user, $access), $this->name(), $result->summary, $result->taskIds);
                    }

                    return $result;
                });
        } catch (TaskDomainException $e) {
            return Response::error($e->getMessage());
        }

        return Response::structured($result instanceof WriteResult ? $result->data : $result);
    }

    /**
     * Also refuses unknown arguments in the schema itself.
     *
     * @return array<string, mixed>
     */
    public function toArray(): array
    {
        $tool = parent::toArray();
        $tool['inputSchema']['additionalProperties'] = false;

        return $tool;
    }

    private function isReadOnly(): bool
    {
        return (new \ReflectionClass($this))->getAttributes(IsReadOnly::class) !== [];
    }

    private function client(User $user, AgentAccess $access): AgentClient
    {
        $token = $user->token();

        // Always a Passport token on /mcp (auth:api); the fallback covers calls made without one (tests, tinker).
        return $token instanceof AccessToken
            ? $access->clientOf($token)
            : new AgentClient(AgentClient::TOKEN, 'unknown', 'Unknown agent');
    }
}
