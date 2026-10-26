<?php

use App\Http\Controllers\PushSubscriptionController;
use App\Http\Controllers\SyncController;
use App\Http\Middleware\EnsureHasAccess;
use App\Http\Middleware\EnsureWebPushConfigured;
use App\Http\Middleware\RememberTimezone;
use Illuminate\Support\Facades\Route;

// The planner is public: guests use it locally, signed-in users also sync. Email verification never gates it.
// In SaaS mode an account without a paid plan is sent to the paywall instead.
Route::inertia('/', 'planner')->middleware(EnsureHasAccess::class)->name('home');

Route::middleware(['auth', EnsureHasAccess::class, RememberTimezone::class])->prefix('sync')->name('sync.')->group(function () {
    Route::post('push', [SyncController::class, 'push'])->name('push');
    Route::get('pull', [SyncController::class, 'pull'])->name('pull');
});

// This browser's Web Push subscription (see Settings › Notifications). Only when the instance has VAPID keys.
Route::middleware(['auth', EnsureWebPushConfigured::class, EnsureHasAccess::class, RememberTimezone::class])
    ->prefix('notifications/subscriptions')
    ->name('notifications.subscriptions.')
    ->group(function () {
        Route::post('/', [PushSubscriptionController::class, 'store'])->middleware('throttle:30,1')->name('store');
        Route::delete('/', [PushSubscriptionController::class, 'destroy'])->name('destroy');
    });

require __DIR__.'/settings.php';
require __DIR__.'/billing.php';
