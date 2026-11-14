<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class MeController extends Controller
{
    /**
     * The signed-in account, for the app to know its plan (the paywall) before syncing.
     */
    public function show(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        return response()->json([
            'user' => $user,
            'account' => [
                'hasAccess' => $user->hasAccess(),
                'plan' => $user->plan()?->value,
            ],
        ]);
    }
}
