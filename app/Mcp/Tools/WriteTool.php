<?php

namespace App\Mcp\Tools;

use App\Actions\Sync\SyncVersions;
use App\Agents\AgentAccess;
use App\Mcp\Support\Planner;
use App\Mcp\Support\WriteResult;
use App\Models\McpActivity;
use Illuminate\Support\Facades\DB;
use Laravel\Mcp\Request;
use Laravel\Passport\AccessToken;

/**
 * A planner tool that changes tasks. It runs in one transaction with its activity log entry ({@see McpActivity}), so
 * a refused call changes nothing and logs nothing (nor does a call that had nothing to change).
 */
abstract class WriteTool extends PlannerTool
{
    abstract protected function run(Request $request, Planner $planner): WriteResult;

    protected function execute(Request $request, Planner $planner): array
    {
        return DB::transaction(function () use ($request, $planner) {
            // The sync write lock comes first, like in TaskRepository::write(): the tool reads before the repository
            // writes, and with SQLite a read transaction that later upgrades to a write fails if a push committed in
            // between.
            SyncVersions::lock();

            $result = $this->run($request, $planner);
            $token = $planner->user->token();

            // Always a Passport token on /mcp (auth:api).
            if ($result->summary !== null && $token instanceof AccessToken) {
                McpActivity::record($planner->user, app(AgentAccess::class)->clientOf($token), $this->name(), $result->summary, $result->taskIds);
            }

            return $result->data;
        });
    }
}
