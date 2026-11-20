<?php

use App\Http\Controllers\Api\MeController;
use App\Http\Controllers\SyncController;
use App\Http\Middleware\AddResourceMetadataHeader;
use App\Http\Middleware\EnsureHasAccess;
use App\Http\Middleware\RememberTimezone;
use App\Http\Middleware\TouchAccessToken;
use Illuminate\Support\Facades\Route;

// The app API for native apps and other token clients (docs/architecture.md#app-api), under /api. No session, cookies
// or CSRF: a Passport Bearer token (the `api` guard), either an OAuth access token (authorization code + PKCE) or a
// personal access token created in Settings › Agents & apps. Independent of MCP_ENABLED.
Route::prefix('v1')
    ->name('api.')
    ->middleware([AddResourceMetadataHeader::class, 'auth:api', TouchAccessToken::class])
    ->group(function () {
        // Works without a plan, so an app can show the paywall before syncing.
        Route::get('me', [MeController::class, 'show'])->middleware('throttle:api')->name('me');

        // Exactly the web sync contract (routes/web.php): same controller, validation, LWW, cursor, X-Sync-Format
        // and X-Timezone; in SaaS mode a planless account gets 402.
        Route::middleware(['throttle:sync', EnsureHasAccess::class, RememberTimezone::class])
            ->prefix('sync')
            ->name('sync.')
            ->group(function () {
                Route::post('push', [SyncController::class, 'push'])->name('push');
                Route::get('pull', [SyncController::class, 'pull'])->name('pull');
            });
    });
