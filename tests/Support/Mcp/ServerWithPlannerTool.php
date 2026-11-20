<?php

namespace Tests\Support\Mcp;

use App\Mcp\Servers\PlainWeekServer;
use App\Mcp\Tools\GetProfile;

class ServerWithPlannerTool extends PlainWeekServer
{
    protected array $tools = [
        GetProfile::class,
        PlannerTool::class,
    ];
}
