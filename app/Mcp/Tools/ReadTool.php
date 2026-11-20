<?php

namespace App\Mcp\Tools;

use App\Mcp\Support\Planner;
use Laravel\Mcp\Request;

/**
 * A planner tool that only reads (mark it `#[IsReadOnly]`): no transaction, nothing logged.
 */
abstract class ReadTool extends PlannerTool
{
    /**
     * @return array<string, mixed>
     */
    abstract protected function run(Request $request, Planner $planner): array;

    protected function execute(Request $request, Planner $planner): array
    {
        return $this->run($request, $planner);
    }
}
