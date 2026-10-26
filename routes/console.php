<?php

use App\Models\SentNotification;
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

// Moves the rolling window of recurring occurrences forward and catches up anything a push-triggered run missed.
Schedule::command('google-calendar:sync')->dailyAt('03:00');

// Web Push: morning notifications and task reminders (does nothing unless VAPID keys are set).
// The lock expires after 5 minutes, so a run killed mid-way does not stop the next ones for a day.
Schedule::command('notifications:send')->everyMinute()->withoutOverlapping(5);
Schedule::command('model:prune', ['--model' => [SentNotification::class]])->daily();
