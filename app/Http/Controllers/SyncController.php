<?php

namespace App\Http\Controllers;

use App\Actions\Sync\PullTasks;
use App\Actions\Sync\PushTasks;
use App\Actions\Sync\SyncFormat;
use App\Http\Requests\Sync\PullRequest;
use App\Http\Requests\Sync\PushRequest;
use App\Http\Resources\TaskResource;
use App\Jobs\SyncGoogleCalendar;
use App\Models\TaskLabel;
use Illuminate\Http\JsonResponse;

class SyncController extends Controller
{
    /**
     * Apply a batch of client records.
     */
    public function push(PushRequest $request, PushTasks $pushTasks): JsonResponse
    {
        $result = $pushTasks->handle($request->user(), $request->records(), SyncFormat::fromRequest($request), $request->labels());

        if ($result['applied'] !== []) {
            SyncGoogleCalendar::dispatchFor($request->user(), SyncGoogleCalendar::DEBOUNCE_SECONDS);
        }

        return response()->json($result);
    }

    /**
     * Return the user's changes after the given cursor.
     */
    public function pull(PullRequest $request, PullTasks $pullTasks): JsonResponse
    {
        $format = SyncFormat::fromRequest($request);
        $result = $pullTasks->handle($request->user(), $request->cursor(), $request->limit(), $format);

        return response()->json([
            'tasks' => TaskResource::collection($result['tasks']),
            ...$format->understandsLabels()
                ? ['labels' => $result['labels']->map(fn (TaskLabel $label) => $label->toRecord())->values()]
                : [],
            'cursor' => $result['cursor'],
            'has_more' => $result['has_more'],
        ]);
    }
}
