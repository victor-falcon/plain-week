<?php

use App\Jobs\SyncGoogleCalendar;
use App\Models\GoogleCalendarConnection;
use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

/*
 * Scheduled tasks: register them here with the Schedule facade. The Docker image runs `schedule:work` and a
 * `queue:work` worker for the database queue next to the server (docker/entrypoint.sh); `composer dev` runs both too.
 * Keep scheduled callbacks short and dispatch the real work as queued jobs: a job's logs reach the container output,
 * and a slow callback would hold back the tasks after it. Keep jobs short and safe to run twice: a stop can cut one
 * short, and it is retried.
 */

Artisan::command('google-calendar:sync {--user= : Only this user id}', function () {
    GoogleCalendarConnection::query()
        ->whereNull('disconnected_reason')
        ->when($this->option('user'), fn ($query, $userId) => $query->where('user_id', $userId))
        ->pluck('user_id')
        ->each(fn (int $userId) => SyncGoogleCalendar::dispatch($userId));
})->purpose('Queue a Google Calendar sync for every working connection');

// Moves the rolling window of recurring occurrences forward and catches up anything a push-triggered run missed.
Schedule::command('google-calendar:sync')->dailyAt('03:00');
