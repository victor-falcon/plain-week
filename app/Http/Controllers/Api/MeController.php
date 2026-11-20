<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class MeController extends Controller
{
    /**
     * The token's account and its entitlement, so an app can show the paywall before syncing. Same shape as the web's
     * shared `auth.user` and `account` props.
     */
    public function show(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        return response()->json([
            'user' => $user,
            'account' => $user->accountSummary(),
        ]);
    }
}
