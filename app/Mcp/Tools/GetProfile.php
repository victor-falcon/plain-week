<?php

namespace App\Mcp\Tools;

use App\Models\User;
use App\Support\AppVersion;
use Illuminate\Support\Facades\Date;
use Laravel\Mcp\Request;
use Laravel\Mcp\Response;
use Laravel\Mcp\ResponseFactory;
use Laravel\Mcp\Server\Attributes\Description;
use Laravel\Mcp\Server\Attributes\Name;
use Laravel\Mcp\Server\Tool;
use Laravel\Mcp\Server\Tools\Annotations\IsIdempotent;
use Laravel\Mcp\Server\Tools\Annotations\IsReadOnly;

#[Name('get_profile')]
#[Description('The signed-in Plain Week user: name, email, time zone, today\'s date in that time zone, the app version and whether their account can sync (a paid plan on plainweek.eu, always on a self-hosted instance). Call it first: every date in Plain Week is a calendar date in this time zone.')]
#[IsReadOnly]
#[IsIdempotent]
class GetProfile extends Tool implements AvailableWithoutPlan
{
    public function handle(Request $request): ResponseFactory
    {
        /** @var User $user */
        $user = $request->user();
        $timezone = $user->timezoneOrDefault();
        $now = Date::now($timezone);

        return Response::structured([
            'name' => $user->name,
            'email' => $user->email,
            'timezone' => $timezone,
            'today' => $now->toDateString(),
            'weekday' => $now->format('l'),
            'app_version' => AppVersion::current(),
            'sync_access' => $user->hasAccess(),
            // Where to get a plan when sync_access is false (SaaS only).
            'plans_url' => $user->hasAccess() || ! config('saas.enabled') ? null : route('billing.plans'),
        ]);
    }
}
