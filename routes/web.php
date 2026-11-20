<?php

use App\Http\Controllers\Auth\OidcController;
use App\Http\Controllers\PushSubscriptionController;
use App\Http\Controllers\SyncController;
use App\Http\Middleware\EnsureHasAccess;
use App\Http\Middleware\EnsureOidcEnabled;
use App\Http\Middleware\EnsureWebPushConfigured;
use App\Http\Middleware\RememberTimezone;
use Illuminate\Support\Facades\Route;

// The planner is public: guests use it locally, signed-in users also sync. Email verification never gates it.
// In SaaS mode an account without a paid plan is sent to the paywall instead.
Route::inertia('/', 'planner')->middleware(EnsureHasAccess::class)->name('home');

// The app API has the same routes for Bearer tokens (routes/api.php). `throttle:sync` is per user.
Route::middleware(['auth', 'throttle:sync', EnsureHasAccess::class, RememberTimezone::class])->prefix('sync')->name('sync.')->group(function () {
    Route::post('push', [SyncController::class, 'push'])->name('push');
    Route::get('pull', [SyncController::class, 'pull'])->name('pull');
});

// This browser's Web Push subscription (see Settings › Notifications). Only when the instance has VAPID keys.
// Subscribing is a paid feature in SaaS mode; unsubscribing stays reachable after a plan lapses.
Route::middleware(['auth', EnsureWebPushConfigured::class, RememberTimezone::class])
    ->prefix('notifications/subscriptions')
    ->name('notifications.subscriptions.')
    ->group(function () {
        Route::post('/', [PushSubscriptionController::class, 'store'])
            ->middleware([EnsureHasAccess::class, 'throttle:30,1'])
            ->name('store');
        Route::delete('/', [PushSubscriptionController::class, 'destroy'])->name('destroy');
    });

// Logging in through an OpenID Connect IdP (config/oidc.php), and re-authenticating there instead of typing a
// password (`?confirm=1`). 404 while it is not configured or OIDC_ENABLED is off.
Route::middleware([EnsureOidcEnabled::class, 'throttle:oidc'])->prefix('auth/oidc')->name('oidc.')->group(function () {
    Route::get('redirect', [OidcController::class, 'redirect'])->name('redirect');
    Route::get('callback', [OidcController::class, 'callback'])->name('callback');
});

require __DIR__.'/settings.php';
require __DIR__.'/billing.php';
