<?php

namespace App\Mcp\Tools;

use App\Mcp\Support\Planner;
use App\Models\User;
use App\Tasks\TaskDomainException;
use Illuminate\JsonSchema\JsonSchemaTypeFactory;
use Laravel\Mcp\Request;
use Laravel\Mcp\Response;
use Laravel\Mcp\ResponseFactory;
use Laravel\Mcp\Server\Tool;

/**
 * A tool over the signed-in user's planner (see docs/architecture.md#mcp-tools). It refuses arguments its schema does
 * not declare, turns the domain's errors ({@see TaskDomainException}, validation) into tool errors the agent can relay,
 * and returns structured content. Extend {@see ReadTool} or {@see WriteTool}.
 */
abstract class PlannerTool extends Tool
{
    /**
     * Runs the tool and returns its structured result.
     *
     * @return array<string, mixed>
     */
    abstract protected function execute(Request $request, Planner $planner): array;

    public function handle(Request $request): Response|ResponseFactory
    {
        $allowed = array_keys($this->schema(new JsonSchemaTypeFactory));
        $unknown = array_diff(array_keys($request->all()), $allowed);

        if ($unknown !== []) {
            return Response::error('Unknown argument'.(count($unknown) > 1 ? 's' : '').': '.implode(', ', $unknown).'. '
                .($allowed === [] ? 'This tool takes no arguments.' : 'This tool takes: '.implode(', ', $allowed).'.'));
        }

        /** @var User $user */
        $user = $request->user();

        try {
            return Response::structured($this->execute($request, new Planner($user)));
        } catch (TaskDomainException $e) {
            return Response::error($e->getMessage());
        }
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
}
