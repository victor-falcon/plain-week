<?php

use App\Http\Controllers\Api\MeController;
use App\Http\Controllers\Api\TokenController;
use App\Http\Controllers\SyncController;
use App\Http\Middleware\AuthenticateApiToken;
use App\Http\Middleware\EnsureHasAccess;
use App\Http\Middleware\RememberTimezone;
use Illuminate\Support\Facades\Route;

// The API of the native apps (see docs/architecture.md#native-app-api): no cookies and no CSRF,
// a Bearer token per device instead. Registered with the `api` prefix, so these live under /api.
Route::post('v1/tokens', [TokenController::class, 'store'])
    ->middleware('throttle:5,1')
    ->name('api.tokens.store');

Route::middleware([AuthenticateApiToken::class])->name('api.')->group(function () {
    Route::delete('v1/tokens', [TokenController::class, 'destroy'])->name('tokens.destroy');
    Route::get('v1/me', [MeController::class, 'show'])->name('me');

    // The same sync contract as the web routes (routes/web.php), for token auth. X-Sync-Format
    // and X-Timezone work exactly the same; in SaaS mode a planless account gets a 402.
    Route::middleware([EnsureHasAccess::class, RememberTimezone::class, 'throttle:120,1'])
        ->prefix('v1/sync')
        ->name('sync.')
        ->group(function () {
            Route::post('push', [SyncController::class, 'push'])->name('push');
            Route::get('pull', [SyncController::class, 'pull'])->name('pull');
        });
});
