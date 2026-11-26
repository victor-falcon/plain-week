<?php

namespace App\Http\Controllers\Settings;

use App\Http\Controllers\Controller;
use App\Models\IcsFeed;
use App\Models\User;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;

/**
 * Settings › Integrations › Calendar feed: turning the ICS subscription feed on, giving it a new URL, turning it off.
 */
class IcsFeedController extends Controller
{
    /**
     * Enables the feed, or regenerates its URL when it is on (the old URL stops working at once).
     */
    public function store(Request $request): RedirectResponse
    {
        $user = $this->user($request);
        $regenerated = $user->icsFeed()->exists();

        IcsFeed::enableFor($user);

        Inertia::flash('toast', [
            'type' => 'success',
            'message' => $regenerated ? __('New calendar feed URL created. The old one no longer works.') : __('Calendar feed enabled.'),
        ]);

        return to_route('integrations.edit');
    }

    /**
     * Disables the feed: its URL stops working.
     */
    public function destroy(Request $request): RedirectResponse
    {
        $this->user($request)->icsFeed()->delete();

        Inertia::flash('toast', ['type' => 'success', 'message' => __('Calendar feed disabled.')]);

        return to_route('integrations.edit');
    }

    private function user(Request $request): User
    {
        /** @var User */
        return $request->user();
    }
}
