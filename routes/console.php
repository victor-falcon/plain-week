<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;

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
