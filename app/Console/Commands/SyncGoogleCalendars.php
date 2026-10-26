<?php

namespace App\Console\Commands;

use App\Integrations\GoogleCalendar\GoogleOAuth;
use App\Jobs\SyncGoogleCalendar;
use App\Models\GoogleCalendarConnection;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;

#[Signature('google-calendar:sync {--user= : Only the account with this id}')]
#[Description('Queue a Google Calendar sync for every working connection')]
class SyncGoogleCalendars extends Command
{
    public function handle(): int
    {
        if (! GoogleOAuth::configured()) {
            return self::SUCCESS;
        }

        $count = GoogleCalendarConnection::query()
            ->syncable()
            ->when($this->option('user'), fn ($query, $userId) => $query->where('user_id', $userId))
            ->pluck('user_id')
            ->each(fn (int $userId) => SyncGoogleCalendar::dispatch($userId))
            ->count();

        $this->info("Queued {$count} Google Calendar ".str('sync')->plural($count).'.');

        return self::SUCCESS;
    }
}
