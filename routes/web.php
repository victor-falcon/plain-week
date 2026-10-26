<?php

use App\Http\Controllers\SyncController;
use App\Http\Middleware\EnsureHasAccess;
use App\Http\Middleware\RememberTimezone;
use Illuminate\Support\Facades\Route;

// The planner is public: guests use it locally, signed-in users also sync. Email verification never gates it.
// In SaaS mode an account without a paid plan is sent to the paywall instead.
Route::inertia('/', 'planner')->middleware(EnsureHasAccess::class)->name('home');

Route::middleware(['auth', EnsureHasAccess::class, RememberTimezone::class])->prefix('sync')->name('sync.')->group(function () {
    Route::post('push', [SyncController::class, 'push'])->name('push');
    Route::get('pull', [SyncController::class, 'pull'])->name('pull');
});

require __DIR__.'/settings.php';
require __DIR__.'/billing.php';
