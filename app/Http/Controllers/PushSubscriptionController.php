<?php

namespace App\Http\Controllers;

use App\Http\Requests\Notifications\DestroyPushSubscriptionRequest;
use App\Http\Requests\Notifications\StorePushSubscriptionRequest;
use App\Models\PushSubscription;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

class PushSubscriptionController extends Controller
{
    /**
     * Stores this browser's subscription, keyed by endpoint: a browser that subscribes again (new keys) or now belongs
     * to another account (someone else signed in) updates the row instead of adding one.
     */
    public function store(StorePushSubscriptionRequest $request): Response
    {
        $endpoint = $request->string('endpoint')->value();

        PushSubscription::query()->updateOrCreate(
            ['endpoint_hash' => PushSubscription::hashEndpoint($endpoint)],
            [
                'user_id' => $this->user($request)->id,
                'endpoint' => $endpoint,
                'p256dh' => $request->string('keys.p256dh')->value(),
                'auth' => $request->string('keys.auth')->value(),
                'content_encoding' => $request->string('content_encoding')->value() ?: 'aes128gcm',
                'user_agent' => $request->userAgent() === null ? null : mb_substr($request->userAgent(), 0, 512),
            ],
        );

        return response()->noContent();
    }

    /**
     * Forgets this browser's subscription. Only the user's own; an unknown endpoint is already gone.
     */
    public function destroy(DestroyPushSubscriptionRequest $request): Response
    {
        $this->user($request)->pushSubscriptions()
            ->whereEndpointIn([$request->string('endpoint')->value()])
            ->delete();

        return response()->noContent();
    }

    private function user(Request $request): User
    {
        /** @var User */
        return $request->user();
    }
}
