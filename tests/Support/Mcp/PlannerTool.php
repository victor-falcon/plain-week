<?php

namespace Tests\Support\Mcp;

use Laravel\Mcp\Request;
use Laravel\Mcp\Response;
use Laravel\Mcp\Server\Attributes\Name;
use Laravel\Mcp\Server\Tool;

/** Stands in for a planner tool (one without AvailableWithoutPlan) until the real ones exist. */
#[Name('planner_tool')]
class PlannerTool extends Tool
{
    public function handle(Request $request): Response
    {
        return Response::text('Planner data.');
    }
}
