<?php

use App\Http\Controllers\SyncController;
use Illuminate\Support\Facades\Route;

// The planner is public: guests use it locally, signed-in users also sync. Email verification never gates it.
Route::inertia('/', 'planner')->name('home');

Route::middleware('auth')->prefix('sync')->name('sync.')->group(function () {
    Route::post('push', [SyncController::class, 'push'])->name('push');
    Route::get('pull', [SyncController::class, 'pull'])->name('pull');
});

require __DIR__.'/settings.php';
