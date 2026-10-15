<?php

namespace App\Http\Controllers;

use App\Actions\Sync\PullTasks;
use App\Actions\Sync\PushTasks;
use App\Http\Requests\Sync\PullRequest;
use App\Http\Requests\Sync\PushRequest;
use App\Http\Resources\TaskResource;
use Illuminate\Http\JsonResponse;

class SyncController extends Controller
{
    /**
     * Apply a batch of client records.
     */
    public function push(PushRequest $request, PushTasks $pushTasks): JsonResponse
    {
        return response()->json($pushTasks->handle($request->user(), $request->records()));
    }

    /**
     * Return the user's changes after the given cursor.
     */
    public function pull(PullRequest $request, PullTasks $pullTasks): JsonResponse
    {
        $result = $pullTasks->handle($request->user(), $request->cursor(), $request->limit());

        return response()->json([
            'tasks' => TaskResource::collection($result['tasks']),
            'cursor' => $result['cursor'],
            'has_more' => $result['has_more'],
        ]);
    }
}
