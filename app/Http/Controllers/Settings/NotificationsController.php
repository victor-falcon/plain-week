<?php

namespace App\Http\Controllers\Settings;

use App\Http\Controllers\Controller;
use App\Http\Requests\Settings\NotificationsUpdateRequest;
use App\Models\User;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class NotificationsController extends Controller
{
    /**
     * Settings › Notifications. Whether this browser is subscribed is only known to the browser.
     */
    public function edit(Request $request): Response
    {
        $user = $this->user($request);

        return Inertia::render('settings/notifications', [
            'morningTime' => $user->notification_morning_time,
            'timezone' => $user->timezone,
        ]);
    }

    public function update(NotificationsUpdateRequest $request): RedirectResponse
    {
        $this->user($request)->forceFill(['notification_morning_time' => $request->string('morning_time')->value()])->save();

        Inertia::flash('toast', ['type' => 'success', 'message' => __('Notifications updated.')]);

        return back();
    }

    private function user(Request $request): User
    {
        /** @var User */
        return $request->user();
    }
}
