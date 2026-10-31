<?php

use App\Models\PushSubscription;
use App\Models\SentNotification;
use App\Models\Task;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Support\FakePushSender;

uses(RefreshDatabase::class);

beforeEach(function () {
    config([
        'services.webpush.public_key' => 'public-key',
        'services.webpush.private_key' => 'private-key',
        'services.webpush.subject' => 'mailto:admin@example.com',
    ]);
    $this->sender = FakePushSender::install();
    $this->user = User::factory()->create(['timezone' => 'Europe/Madrid']);
    pushSubscription($this->user);
});

function pushSubscription(User $user, string $endpoint = 'https://push.example.com/1'): PushSubscription
{
    return $user->pushSubscriptions()->create([
        'endpoint' => $endpoint,
        'endpoint_hash' => PushSubscription::hashEndpoint($endpoint),
        'p256dh' => 'p256dh',
        'auth' => 'auth',
    ]);
}

/**
 * @param  array<string, mixed>  $attributes
 */
function notifiedTask(array $attributes = [], ?User $user = null): Task
{
    return Task::factory()->for($user ?? test()->user)->create(['text' => 'Call mom', 'date' => '2026-10-27', ...$attributes]);
}

/**
 * Runs the scheduled command at a local wall time ('Y-m-d H:i:s') of the time zone.
 */
function sendNotificationsAt(string $localTime, string $timezone = 'Europe/Madrid'): void
{
    test()->travelTo(CarbonImmutable::parse($localTime, $timezone));
    test()->artisan('notifications:send')->assertSuccessful();
}

describe('morning notifications', function () {
    test('one for the only pending task of the day without a time, at the morning time in the user time zone', function () {
        $task = notifiedTask(['id' => 'task-1', 'text' => 'Call mom']);
        notifiedTask(['id' => 'task-2', 'text' => 'Dentist', 'time' => '17:30']);
        notifiedTask(['text' => 'Done already', 'done' => true]);
        notifiedTask(['text' => 'Tomorrow', 'date' => '2026-10-28']);
        notifiedTask(['text' => 'Deleted'])->forceFill(['deleted_at' => now()])->save();

        sendNotificationsAt('2026-10-27 07:59:00');
        expect($this->sender->messages())->toBe([]);

        sendNotificationsAt('2026-10-27 08:00:05');
        expect($this->sender->messages())->toBe([
            ['title' => 'Call mom', 'body' => 'Today', 'url' => '/?task=task-1', 'tag' => 'morning:2026-10-27'],
        ]);
        expect($task->user->pushSubscriptions()->first()->last_used_at)->not->toBeNull();
    });

    test('one summary for several pending tasks of the day without a time, in planner order', function () {
        notifiedTask(['id' => 'task-1', 'text' => 'Call mom', 'position' => 'a1']);
        notifiedTask(['id' => 'task-2', 'text' => 'Buy bread', 'position' => 'a0']);
        notifiedTask(['id' => 'series', 'text' => 'Gym', 'date' => '2026-10-12', 'position' => 'a2', 'recurrence' => ['type' => 'daily', 'every' => 1]]);
        notifiedTask(['text' => 'Dentist', 'time' => '17:30']);
        notifiedTask(['text' => 'Done already', 'done' => true]);

        sendNotificationsAt('2026-10-27 08:00:00');

        expect($this->sender->messages())->toBe([
            ['title' => '3 tasks today', 'body' => 'Buy bread · Call mom · Gym', 'url' => '/', 'tag' => 'morning:2026-10-27'],
        ]);
        expect(SentNotification::query()->get(['occurrence_key', 'kind', 'date'])->toArray())->toBe([
            ['occurrence_key' => 'day', 'kind' => 'morning', 'date' => '2026-10-27'],
        ]);
    });

    test('nothing when every task of the day is done or has a time', function () {
        notifiedTask(['text' => 'Done already', 'done' => true]);
        notifiedTask(['text' => 'Dentist', 'time' => '17:30']);

        sendNotificationsAt('2026-10-27 08:00:00');

        expect($this->sender->messages())->toBe([])
            ->and(SentNotification::count())->toBe(0);
    });

    test('sent once per day, even when tasks are added after it', function () {
        notifiedTask(['id' => 'task-1']);

        sendNotificationsAt('2026-10-27 08:00:00');
        notifiedTask(['id' => 'task-2', 'text' => 'Added later']);
        sendNotificationsAt('2026-10-27 08:03:00');

        expect($this->sender->tags())->toBe(['morning:2026-10-27'])
            ->and($this->sender->deliveries)->toHaveCount(1);
    });

    test('long task texts are shortened so the summary fits the push payload', function () {
        foreach (range(1, 50) as $i) {
            notifiedTask(['id' => "task-{$i}", 'text' => str_repeat('😀', 5000)]);
        }

        sendNotificationsAt('2026-10-27 08:00:00');

        $message = $this->sender->deliveries[0]->message;
        expect($message->title)->toBe('50 tasks today')
            ->and(mb_strwidth($message->body))->toBeLessThanOrEqual(400)
            ->and($message->body)->toEndWith('…')
            ->and(strlen($message->toJson()))->toBeLessThan(2048);
    });

    test('uses the morning time the user chose', function () {
        $this->user->forceFill(['notification_morning_time' => '06:45'])->save();
        notifiedTask();

        sendNotificationsAt('2026-10-27 08:00:00');
        expect($this->sender->messages())->toBe([]);

        sendNotificationsAt('2026-10-28 06:45:00');
        expect($this->sender->messages())->toBe([]); // The task is on the 27th.

        notifiedTask(['id' => 'task-28', 'date' => '2026-10-28']);
        $this->travelBack();
        sendNotificationsAt('2026-10-28 06:46:00');
        expect($this->sender->tags())->toBe(['morning:2026-10-28']);
    });

    test('follows each user time zone', function () {
        $tokyo = User::factory()->create(['timezone' => 'Asia/Tokyo']);
        pushSubscription($tokyo, 'https://push.example.com/tokyo');
        notifiedTask(['id' => 'madrid']);
        notifiedTask(['id' => 'tokyo'], $tokyo);

        // 08:00 in Tokyo is 00:00 in Madrid.
        sendNotificationsAt('2026-10-27 08:00:00', 'Asia/Tokyo');
        expect($this->sender->tags())->toBe(['morning:2026-10-27']);
        expect($this->sender->deliveries[0]->subscription->endpoint)->toBe('https://push.example.com/tokyo');
    });

    test('falls back to the app time zone when the browser never reported one', function () {
        config(['app.timezone' => 'America/New_York']);
        $this->user->forceFill(['timezone' => null])->save();
        notifiedTask(['id' => 'task-1']);

        sendNotificationsAt('2026-10-27 08:00:00', 'Europe/Madrid');
        expect($this->sender->messages())->toBe([]);

        sendNotificationsAt('2026-10-27 08:00:00', 'America/New_York');
        expect($this->sender->tags())->toBe(['morning:2026-10-27']);
    });

    test('a task with a time only gets its reminder', function () {
        notifiedTask(['id' => 'task-1', 'time' => '09:00']);
        notifiedTask(['id' => 'series', 'date' => '2026-10-12', 'time' => '09:00', 'recurrence' => ['type' => 'daily', 'every' => 1]]);

        sendNotificationsAt('2026-10-27 08:00:00');
        expect($this->sender->messages())->toBe([]);

        sendNotificationsAt('2026-10-27 08:55:00');
        expect($this->sender->tags())->toBe(['reminder:series:2026-10-27:2026-10-27', 'reminder:task-1:2026-10-27']);
    });

    test('includes the occurrences of recurring tasks', function () {
        notifiedTask(['id' => 'series', 'text' => 'Gym', 'date' => '2026-10-12', 'recurrence' => ['type' => 'weekly', 'weekdays' => [2]]]);
        notifiedTask(['id' => 'other', 'text' => 'Run', 'date' => '2026-10-12', 'recurrence' => ['type' => 'weekly', 'weekdays' => [3]]]);

        sendNotificationsAt('2026-10-27 08:00:00'); // A Tuesday.

        expect($this->sender->messages())->toBe([
            ['title' => 'Gym', 'body' => 'Today', 'url' => '/?task=series%3A2026-10-27', 'tag' => 'morning:2026-10-27'],
        ]);
    });

    test('skips an occurrence marked done (an exception row)', function () {
        notifiedTask(['id' => 'series', 'date' => '2026-10-12', 'recurrence' => ['type' => 'daily', 'every' => 1]]);
        notifiedTask(['id' => 'done', 'series_id' => 'series', 'occurrence_date' => '2026-10-27', 'done' => true]);

        sendNotificationsAt('2026-10-27 08:00:00');

        expect($this->sender->messages())->toBe([]);
    });

    test('catches up a late run, but not after the catch-up window', function () {
        notifiedTask(['id' => 'task-1']);

        sendNotificationsAt('2026-10-27 08:09:59');
        expect($this->sender->tags())->toBe(['morning:2026-10-27']);

        notifiedTask(['id' => 'task-28', 'date' => '2026-10-28']);
        $this->travelBack();
        sendNotificationsAt('2026-10-28 08:10:00');
        expect($this->sender->tags())->toBe(['morning:2026-10-27']);
    });

    test('a morning time just before midnight is still sent just after it, for the day before', function () {
        $this->user->forceFill(['notification_morning_time' => '23:58'])->save();
        notifiedTask(['id' => 'task-1']);

        sendNotificationsAt('2026-10-28 00:03:00');

        expect($this->sender->tags())->toBe(['morning:2026-10-27']);
    });

    test('a morning time a DST jump skips is sent when the clock reaches it', function () {
        // Europe/Madrid jumps from 02:00 to 03:00 on 2026-03-29.
        $this->user->forceFill(['notification_morning_time' => '02:30'])->save();
        notifiedTask(['id' => 'task-1', 'date' => '2026-03-29']);

        sendNotificationsAt('2026-03-29 01:59:00');
        expect($this->sender->messages())->toBe([]);

        sendNotificationsAt('2026-03-29 03:30:00');
        expect($this->sender->tags())->toBe(['morning:2026-03-29']);
    });

    test('a morning time a DST change repeats is sent once', function () {
        // Europe/Madrid goes back from 03:00 to 02:00 on 2026-10-25.
        $this->user->forceFill(['notification_morning_time' => '02:30'])->save();
        notifiedTask(['id' => 'task-1', 'date' => '2026-10-25']);

        foreach (['2026-10-25T00:30:00Z', '2026-10-25T00:35:00Z', '2026-10-25T01:30:00Z', '2026-10-25T01:35:00Z'] as $utc) {
            $this->travelTo(CarbonImmutable::parse($utc));
            $this->artisan('notifications:send')->assertSuccessful();
        }

        expect($this->sender->tags())->toBe(['morning:2026-10-25']);
    });
});

describe('reminders', function () {
    test('five minutes before a pending timed task', function () {
        notifiedTask(['id' => 'task-1', 'text' => 'Dentist', 'time' => '17:30']);
        notifiedTask(['text' => 'Done', 'time' => '17:30', 'done' => true]);

        sendNotificationsAt('2026-10-27 17:24:00');
        expect($this->sender->messages())->toBe([]);

        sendNotificationsAt('2026-10-27 17:25:00');
        expect($this->sender->messages())->toBe([
            ['title' => 'Dentist', 'body' => 'In 5 minutes · 17:30', 'url' => '/?task=task-1', 'tag' => 'reminder:task-1:2026-10-27'],
        ]);
    });

    test('a late run still reminds until the task starts', function () {
        notifiedTask(['id' => 'task-1', 'time' => '17:30']);
        notifiedTask(['id' => 'task-2', 'time' => '17:28']);

        sendNotificationsAt('2026-10-27 17:29:00');

        expect($this->sender->tags())->toBe(['reminder:task-1:2026-10-27']);
    });

    test('a task just after midnight is reminded the evening before', function () {
        notifiedTask(['id' => 'task-1', 'date' => '2026-10-28', 'time' => '00:03']);

        sendNotificationsAt('2026-10-27 23:58:00');

        expect($this->sender->tags())->toBe(['reminder:task-1:2026-10-28']);
    });

    test('reminds the occurrences of recurring tasks, at their own time', function () {
        notifiedTask(['id' => 'series', 'text' => 'Standup', 'date' => '2026-10-12', 'time' => '09:00', 'recurrence' => ['type' => 'daily', 'every' => 1]]);
        notifiedTask(['id' => 'moved', 'text' => 'Standup', 'time' => '10:00', 'series_id' => 'series', 'occurrence_date' => '2026-10-28', 'date' => '2026-10-28']);

        sendNotificationsAt('2026-10-27 08:55:00');
        sendNotificationsAt('2026-10-28 08:55:00');
        sendNotificationsAt('2026-10-28 09:55:00');

        expect($this->sender->tags())->toBe(['reminder:series:2026-10-27:2026-10-27', 'reminder:moved:2026-10-28']);
    });

    test('uses the user time zone on a DST day', function () {
        // 2026-03-29 in Madrid: 17:30 local is 15:30 UTC (CEST), not 16:30.
        notifiedTask(['id' => 'task-1', 'date' => '2026-03-29', 'time' => '17:30']);

        $this->travelTo(CarbonImmutable::parse('2026-03-29T16:25:00Z'));
        $this->artisan('notifications:send')->assertSuccessful();
        expect($this->sender->messages())->toBe([]);

        $this->travelTo(CarbonImmutable::parse('2026-03-29T15:25:00Z'));
        $this->artisan('notifications:send')->assertSuccessful();
        expect($this->sender->tags())->toBe(['reminder:task-1:2026-03-29']);
    });
});

describe('delivery', function () {
    test('a notification is sent once, however often the minute runs', function () {
        notifiedTask(['id' => 'task-1']);
        notifiedTask(['id' => 'task-2', 'time' => '08:05']);

        sendNotificationsAt('2026-10-27 08:00:00');
        sendNotificationsAt('2026-10-27 08:00:30');
        sendNotificationsAt('2026-10-27 08:01:00');

        expect($this->sender->tags())->toBe(['morning:2026-10-27', 'reminder:task-2:2026-10-27'])
            ->and($this->sender->deliveries)->toHaveCount(2)
            ->and(SentNotification::count())->toBe(2);
    });

    test('an occurrence edited after its reminder is not reminded again', function () {
        notifiedTask(['id' => 'series', 'date' => '2026-10-12', 'time' => '09:00', 'recurrence' => ['type' => 'daily', 'every' => 1]]);

        sendNotificationsAt('2026-10-27 08:55:00');
        notifiedTask(['id' => 'edited', 'text' => 'Renamed', 'time' => '09:00', 'series_id' => 'series', 'occurrence_date' => '2026-10-27']);
        sendNotificationsAt('2026-10-27 08:57:00');

        expect($this->sender->tags())->toBe(['reminder:series:2026-10-27:2026-10-27']);
    });

    test('a morning notification may wait four hours for an offline device, a reminder one', function () {
        notifiedTask(['id' => 'task-1']);
        notifiedTask(['id' => 'task-2', 'time' => '08:05']);

        sendNotificationsAt('2026-10-27 08:00:00');

        expect($this->sender->ttls())->toBe(['morning:2026-10-27' => 14400, 'reminder:task-2:2026-10-27' => 3600]);
    });

    test('a send that fails is retried by the next run', function () {
        notifiedTask(['id' => 'task-1']);
        $this->sender->unreachable();

        expect(fn () => sendNotificationsAt('2026-10-27 08:00:00'))->toThrow(RuntimeException::class);
        expect(SentNotification::count())->toBe(0);

        $this->sender->unreachable(false);
        sendNotificationsAt('2026-10-27 08:01:00');
        expect($this->sender->tags())->toBe(['morning:2026-10-27']);
    });

    test('a notification no browser accepted is retried by the next run', function () {
        notifiedTask(['id' => 'task-1']);
        $this->sender->fail('https://push.example.com/1');

        sendNotificationsAt('2026-10-27 08:00:00');
        expect($this->sender->messages())->toBe([])
            ->and(SentNotification::count())->toBe(0);

        $this->sender->recover();
        sendNotificationsAt('2026-10-27 08:01:00');
        expect($this->sender->tags())->toBe(['morning:2026-10-27']);
    });

    test('a notification one browser accepted is not retried for the others', function () {
        pushSubscription($this->user, 'https://push.example.com/2');
        notifiedTask(['id' => 'task-1']);
        $this->sender->fail('https://push.example.com/2');

        sendNotificationsAt('2026-10-27 08:00:00');
        $this->sender->recover();
        sendNotificationsAt('2026-10-27 08:01:00');

        expect($this->sender->deliveries)->toHaveCount(1);
    });

    test('a long task text is shortened to fit the push payload', function () {
        notifiedTask(['text' => str_repeat('a', 5000)]);

        sendNotificationsAt('2026-10-27 08:00:00');

        expect(mb_strlen($this->sender->messages()[0]['title']))->toBe(120)
            ->and($this->sender->messages()[0]['title'])->toEndWith('…');
    });

    test('goes to every subscribed browser of the user', function () {
        pushSubscription($this->user, 'https://push.example.com/2');
        notifiedTask();

        sendNotificationsAt('2026-10-27 08:00:00');

        expect(array_map(fn ($delivery) => $delivery->subscription->endpoint, $this->sender->deliveries))
            ->toBe(['https://push.example.com/1', 'https://push.example.com/2']);
    });

    test('deletes the subscriptions the push service reports gone', function () {
        pushSubscription($this->user, 'https://push.example.com/2');
        $this->sender->expire('https://push.example.com/1');
        notifiedTask();

        sendNotificationsAt('2026-10-27 08:00:00');

        expect($this->user->pushSubscriptions()->pluck('endpoint')->all())->toBe(['https://push.example.com/2']);
    });

    test('users without a subscription get nothing', function () {
        $other = User::factory()->create(['timezone' => 'Europe/Madrid']);
        notifiedTask(['id' => 'other'], $other);

        sendNotificationsAt('2026-10-27 08:00:00');

        expect($this->sender->messages())->toBe([])
            ->and(SentNotification::count())->toBe(0);
    });

    test('nothing is sent while Web Push is not configured', function () {
        config(['services.webpush.private_key' => null]);
        notifiedTask();

        sendNotificationsAt('2026-10-27 08:00:00');

        expect($this->sender->messages())->toBe([]);
    });

    test('nothing is sent to an account without a plan in SaaS mode', function () {
        config(['saas.enabled' => true]);
        notifiedTask();

        sendNotificationsAt('2026-10-27 08:00:00');

        expect($this->sender->messages())->toBe([]);
    });

    test('sent notifications are pruned after a few days', function () {
        notifiedTask();
        sendNotificationsAt('2026-10-27 08:00:00');

        $this->travelTo(CarbonImmutable::parse('2026-10-29 08:00:00', 'Europe/Madrid'));
        $this->artisan('model:prune', ['--model' => [SentNotification::class]]);
        expect(SentNotification::count())->toBe(1);

        $this->travelTo(CarbonImmutable::parse('2026-10-30 08:01:00', 'Europe/Madrid'));
        $this->artisan('model:prune', ['--model' => [SentNotification::class]]);
        expect(SentNotification::count())->toBe(0);
    });

    test('deleting the account deletes its subscriptions', function () {
        $this->user->delete();

        expect(PushSubscription::count())->toBe(0);
    });
});
