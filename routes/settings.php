<?php

use App\Http\Controllers\Settings\AgentsController;
use App\Http\Controllers\Settings\GoogleCalendarController;
use App\Http\Controllers\Settings\LanguageController;
use App\Http\Controllers\Settings\NotificationsController;
use App\Http\Controllers\Settings\ProfileController;
use App\Http\Controllers\Settings\SecurityController;
use App\Http\Middleware\EnsureGoogleCalendarConfigured;
use App\Http\Middleware\EnsureHasAccess;
use App\Http\Middleware\EnsurePasswordLoginAllowed;
use App\Http\Middleware\EnsureWebPushConfigured;
use Illuminate\Auth\Middleware\RequirePassword;
use Illuminate\Support\Facades\Route;

Route::middleware(['auth'])->group(function () {
    Route::get('settings', fn () => to_route('profile.edit'));

    Route::get('settings/profile', [ProfileController::class, 'edit'])->name('profile.edit');
    Route::patch('settings/profile', [ProfileController::class, 'update'])->name('profile.update');
    Route::delete('settings/profile', [ProfileController::class, 'destroy'])->name('profile.destroy');

    Route::get('settings/security', [SecurityController::class, 'edit'])
        ->middleware(RequirePassword::class)
        ->name('security.edit');

    Route::put('settings/password', [SecurityController::class, 'update'])
        ->middleware(['throttle:6,1', EnsurePasswordLoginAllowed::class])
        ->name('user-password.update');

    Route::inertia('settings/appearance', 'settings/appearance')->name('appearance.edit');

    // Planner preferences are stored per device in the browser; the server only serves the page.
    Route::inertia('settings/preferences', 'settings/preferences')->name('preferences.edit');
    // Label names live in IndexedDB and sync with the account like tasks; the server only serves the page.
    Route::inertia('settings/labels', 'settings/labels')->name('labels.edit');

    // The interface language is the exception: it belongs to the account, so emails and push notifications use it.
    Route::patch('settings/language', [LanguageController::class, 'update'])->name('language.update');

    // Export and import run in the browser against IndexedDB; the server only serves the page.
    Route::inertia('settings/data', 'settings/data')->name('data.edit');

    // Push notifications: only when the instance has VAPID keys. Whether this browser is subscribed lives in the
    // browser (routes/web.php has the subscription endpoints).
    Route::middleware([EnsureWebPushConfigured::class, EnsureHasAccess::class])->group(function () {
        Route::get('settings/notifications', [NotificationsController::class, 'edit'])->name('notifications.edit');
        Route::patch('settings/notifications', [NotificationsController::class, 'update'])->name('notifications.update');
    });

    // Google Calendar sync: only when the instance has Google OAuth credentials. Connecting is a paid feature in
    // SaaS mode; the page and disconnecting stay reachable, so a lapsed plan can still remove the calendar.
    Route::middleware(EnsureGoogleCalendarConfigured::class)
        ->prefix('settings/integrations')
        ->name('integrations.')
        ->group(function () {
            Route::get('/', [GoogleCalendarController::class, 'edit'])->name('edit');
            Route::delete('google', [GoogleCalendarController::class, 'destroy'])->name('google.destroy');

            Route::middleware(EnsureHasAccess::class)->group(function () {
                Route::get('google/connect', [GoogleCalendarController::class, 'connect'])
                    ->middleware('throttle:10,1')
                    ->name('google.connect');
                Route::get('google/callback', [GoogleCalendarController::class, 'callback'])->name('google.callback');
            });
        });

    // Settings › Agents & apps: the personal tokens and OAuth apps behind the MCP server and the app API. Always on
    // (MCP_ENABLED only hides the MCP part). Tokens and apps can be managed without a plan in SaaS mode; the MCP
    // server and the API sync answer with the paywall then.
    Route::prefix('settings/agents')
        ->name('agents.')
        ->group(function () {
            Route::get('/', [AgentsController::class, 'edit'])->name('edit');
            Route::post('tokens', [AgentsController::class, 'storeToken'])
                ->middleware('throttle:10,1')
                ->name('tokens.store');
            Route::delete('tokens/{token}', [AgentsController::class, 'destroyToken'])->name('tokens.destroy');
            Route::delete('apps/{client}', [AgentsController::class, 'destroyApp'])->name('apps.destroy');
        });
});

Route::get('.well-known/passkey-endpoints', function () {
    return response()->json([
        'enroll' => route('security.edit'),
        'manage' => route('security.edit'),
    ]);
})->name('well-known.passkeys');
