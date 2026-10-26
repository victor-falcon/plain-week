<?php

use App\Http\Controllers\Settings\GoogleCalendarController;
use App\Http\Controllers\Settings\ProfileController;
use App\Http\Controllers\Settings\SecurityController;
use App\Http\Middleware\EnsureGoogleCalendarConfigured;
use App\Http\Middleware\EnsureHasAccess;
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
        ->middleware('throttle:6,1')
        ->name('user-password.update');

    Route::inertia('settings/appearance', 'settings/appearance')->name('appearance.edit');

    // Planner preferences are stored per device in the browser; the server only serves the page.
    Route::inertia('settings/preferences', 'settings/preferences')->name('preferences.edit');

    // Export and import run in the browser against IndexedDB; the server only serves the page.
    Route::inertia('settings/data', 'settings/data')->name('data.edit');

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
});

Route::get('.well-known/passkey-endpoints', function () {
    return response()->json([
        'enroll' => route('security.edit'),
        'manage' => route('security.edit'),
    ]);
})->name('well-known.passkeys');
