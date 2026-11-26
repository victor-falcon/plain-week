<?php

use App\Models\IcsFeed;
use App\Models\Task;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;

uses(RefreshDatabase::class);

beforeEach(function () {
    url()->forceRootUrl('https://plan.example.com');
    url()->forceScheme('https');
    $this->travelTo(CarbonImmutable::parse('2026-10-26 10:00:00', 'UTC'));

    $this->user = User::factory()->create(['timezone' => 'Europe/Madrid']);
    $this->feed = IcsFeed::enableFor($this->user);
});

/**
 * @param  array<string, mixed>  $attributes
 */
function feedTask(array $attributes = []): Task
{
    return Task::factory()->for(test()->user)->create(['text' => 'Buy milk', 'date' => '2026-10-27', ...$attributes]);
}

function fetchFeed(?IcsFeed $feed = null): TestResponse
{
    return test()->get(($feed ?? test()->feed)->url());
}

/**
 * The feed's events, unfolded, each as its property lines keyed by name (with parameters).
 *
 * @return list<array<string, string>>
 */
function feedEvents(?string $ics = null): array
{
    $ics ??= fetchFeed()->assertOk()->getContent();
    $lines = explode("\r\n", str_replace("\r\n ", '', (string) $ics));
    $events = [];
    $current = null;

    foreach ($lines as $line) {
        if ($line === 'BEGIN:VEVENT') {
            $current = [];
        } elseif ($line === 'END:VEVENT') {
            $events[] = $current;
            $current = null;
        } elseif ($current !== null) {
            [$name, $value] = explode(':', $line, 2);
            $current[$name] = $value;
        }
    }

    return $events;
}

/**
 * @return array<string, string>
 */
function onlyFeedEvent(): array
{
    $events = feedEvents();
    expect($events)->toHaveCount(1);

    return $events[0];
}

describe('the feed', function () {
    test('is a calendar document with CRLF lines folded at 75 octets', function () {
        feedTask(['notes' => str_repeat('Long notes, with commas; ', 20)]);

        $response = fetchFeed()->assertOk()->assertHeader('Content-Type', 'text/calendar; charset=utf-8');
        $ics = (string) $response->getContent();

        expect($ics)->toStartWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Plain Week//Plain Week//EN\r\nCALSCALE:GREGORIAN\r\nMETHOD:PUBLISH\r\n")
            ->toContain("\r\nX-WR-CALNAME:Plain Week\r\n")
            ->toContain("\r\nX-WR-TIMEZONE:Europe/Madrid\r\n")
            ->toContain("\r\nREFRESH-INTERVAL;VALUE=DURATION:PT15M\r\n")
            ->toContain("\r\nX-PUBLISHED-TTL:PT15M\r\n")
            ->toEndWith("END:VEVENT\r\nEND:VCALENDAR\r\n")
            ->not->toContain('VALARM')
            ->not->toContain('VTIMEZONE');
        expect(preg_match("/(?<!\r)\n/", $ics))->toBe(0);
        foreach (explode("\r\n", $ics) as $line) {
            expect(strlen($line))->toBeLessThanOrEqual(75);
        }
    });

    test('an untimed task is an all-day event linking to it', function () {
        $task = feedTask(['notes' => "Oat milk\nTwo bottles, cold; please"]);
        $link = "https://plan.example.com/?task={$task->id}";

        expect(onlyFeedEvent())->toBe([
            'UID' => "{$task->id}@plan.example.com",
            'DTSTAMP' => '20261026T100000Z',
            'DTSTART;VALUE=DATE' => '20261027',
            'DTEND;VALUE=DATE' => '20261028',
            'TRANSP' => 'TRANSPARENT',
            'SUMMARY' => '🎯 Buy milk',
            'DESCRIPTION' => 'Oat milk\nTwo bottles\, cold\; please\n\nOpen in Plain Week: '.$link,
            'URL' => $link,
            'STATUS' => 'CONFIRMED',
        ]);
    });

    test('an all-day event at the end of a month ends the next day', function () {
        feedTask(['date' => '2026-12-31']);

        expect(onlyFeedEvent())->toMatchArray(['DTSTART;VALUE=DATE' => '20261231', 'DTEND;VALUE=DATE' => '20270101']);
    });

    test('a task without notes only links to it', function () {
        $task = feedTask();

        expect(onlyFeedEvent()['DESCRIPTION'])->toBe("Open in Plain Week: https://plan.example.com/?task={$task->id}");
    });

    test('a timed task is a 20-minute event in UTC, placed in the user\'s time zone across a DST change', function (string $date, string $start, string $end) {
        feedTask(['date' => $date, 'time' => '09:30']);

        expect(onlyFeedEvent())->toMatchArray(['DTSTART' => $start, 'DTEND' => $end])->not->toHaveKey('TRANSP');
    })->with([
        'summer time' => ['2026-10-24', '20261024T073000Z', '20261024T075000Z'],
        'the day clocks go back' => ['2026-10-25', '20261025T083000Z', '20261025T085000Z'],
        'winter time' => ['2026-10-27', '20261027T083000Z', '20261027T085000Z'],
        'the day clocks go forward' => ['2027-03-28', '20270328T073000Z', '20270328T075000Z'],
    ]);

    test('a time that does not exist on the day clocks go forward lands on the hour after', function () {
        feedTask(['date' => '2027-03-28', 'time' => '02:30']);

        // 02:30 does not exist in Madrid that day: 03:30 CEST.
        expect(onlyFeedEvent())->toMatchArray(['DTSTART' => '20270328T013000Z', 'DTEND' => '20270328T015000Z']);
    });

    test('without a time zone on the account the app\'s is used', function () {
        $this->user->forceFill(['timezone' => null])->save();
        feedTask(['time' => '09:30']);

        $ics = (string) fetchFeed()->getContent();

        expect($ics)->toContain("\r\nX-WR-TIMEZONE:UTC\r\n");
        expect(feedEvents($ics)[0])->toMatchArray(['DTSTART' => '20261027T093000Z']);
    });

    test('done tasks get a check mark', function () {
        feedTask(['done' => true]);

        expect(onlyFeedEvent()['SUMMARY'])->toBe('✅ Buy milk');
    });

    test('long notes are cut like in Google Calendar', function () {
        feedTask(['notes' => str_repeat('a', 7000)]);

        $description = onlyFeedEvent()['DESCRIPTION'];

        expect($description)->toStartWith(str_repeat('a', 6000).'...\n\nOpen in Plain Week: ');
    });

    test('Someday tasks, deleted tasks and other users\' tasks are left out', function () {
        feedTask(['id' => 'kept']);
        feedTask(['id' => 'someday', 'date' => null, 'someday_column' => 0]);
        feedTask(['id' => 'deleted', 'deleted_at' => now()]);
        Task::factory()->create(['id' => 'someone-else', 'date' => '2026-10-27']);

        expect(collect(feedEvents())->pluck('UID')->all())->toBe(['kept@plan.example.com']);
    });

    test('tasks are in it from 30 days ago on, with no limit ahead', function () {
        feedTask(['id' => 'too-old', 'date' => '2026-09-25']);
        feedTask(['id' => 'old', 'date' => '2026-09-26']);
        feedTask(['id' => 'far', 'date' => '2031-01-15']);

        expect(collect(feedEvents())->pluck('UID')->all())->toBe(['old@plan.example.com', 'far@plan.example.com']);
    });

    test('a series has one event per occurrence from 7 days ago to 60 days ahead', function () {
        feedTask(['id' => 'series', 'text' => 'Stretch', 'date' => '2026-09-01', 'time' => '07:00', 'recurrence' => ['type' => 'daily', 'every' => 1]]);

        $events = collect(feedEvents());

        expect($events)->toHaveCount(68)
            ->and($events->first()['UID'])->toBe('series:2026-10-19@plan.example.com')
            ->and($events->last()['UID'])->toBe('series:2026-12-25@plan.example.com')
            ->and($events->firstWhere('UID', 'series:2026-10-26@plan.example.com'))->toMatchArray([
                'SUMMARY' => '🎯 Stretch',
                'DTSTART' => '20261026T060000Z',
                'URL' => 'https://plan.example.com/?task=series%3A2026-10-26',
            ])
            ->and($events->pluck('RRULE')->filter())->toBeEmpty();
    });

    test('an edited or moved occurrence keeps its UID', function () {
        feedTask(['id' => 'series', 'text' => 'Gym', 'date' => '2026-10-26', 'recurrence' => ['type' => 'weekly', 'weekdays' => [1]]]);
        $before = collect(feedEvents())->firstWhere('UID', 'series:2026-11-02@plan.example.com');
        expect($before)->toMatchArray(['DTSTART;VALUE=DATE' => '20261102', 'SUMMARY' => '🎯 Gym']);

        $exception = feedTask([
            'id' => 'exception',
            'text' => 'Gym (short)',
            'date' => '2026-11-03',
            'series_id' => 'series',
            'occurrence_date' => '2026-11-02',
            'done' => true,
        ]);

        $events = collect(feedEvents());

        expect($events->where('UID', 'series:2026-11-02@plan.example.com'))->toHaveCount(1)
            ->and($events->firstWhere('UID', 'series:2026-11-02@plan.example.com'))->toMatchArray([
                'DTSTART;VALUE=DATE' => '20261103',
                'SUMMARY' => '✅ Gym (short)',
                'URL' => "https://plan.example.com/?task={$exception->id}",
            ])
            ->and($events->pluck('UID'))->not->toContain('exception@plan.example.com');
    });

    test('the same planner gives the same ETag, and a matching If-None-Match is a 304', function () {
        feedTask();

        $etag = (string) fetchFeed()->headers->get('ETag');
        $this->travel(5)->minutes();

        $this->get($this->feed->url(), ['If-None-Match' => $etag])->assertStatus(304)->assertContent('');

        feedTask(['id' => 'new']);
        $this->get($this->feed->url(), ['If-None-Match' => $etag])->assertOk();
    });

    test('needs no session and sets no cookie', function () {
        feedTask();

        expect(fetchFeed()->assertOk()->headers->getCookies())->toBeEmpty();
    });

    test('keeps its secret URL out of referrers and search engines', function () {
        fetchFeed()->assertOk()
            ->assertHeader('Referrer-Policy', 'no-referrer')
            ->assertHeader('X-Robots-Tag', 'noindex, nofollow');
    });

    test('an empty planner is a valid calendar without events', function () {
        $ics = (string) fetchFeed()->assertOk()->getContent();

        expect($ics)->toStartWith("BEGIN:VCALENDAR\r\n")->toEndWith("X-PUBLISHED-TTL:PT15M\r\nEND:VCALENDAR\r\n")
            ->and(feedEvents($ics))->toBe([]);
    });
});

describe('access', function () {
    test('an unknown token is a 404', function () {
        $this->get(route('ics-feed.show', ['token' => str_repeat('a', 43)]))->assertNotFound();
    });

    test('a malformed token is a 404', function () {
        $this->get('/calendar/short.ics')->assertNotFound();
    });

    test('a disabled feed is a 404', function () {
        $url = $this->feed->url();
        $this->feed->delete();

        $this->get($url)->assertNotFound();
    });

    test('a regenerated feed answers only at its new URL', function () {
        $old = $this->feed->url();
        $new = IcsFeed::enableFor($this->user);

        expect($new->url())->not->toBe($old);
        $this->get($old)->assertNotFound();
        $this->get($new->url())->assertOk();
    });

    test('in SaaS mode an account without a plan gets a 402', function () {
        config(['saas.enabled' => true]);

        fetchFeed()->assertStatus(402);
    });

    test('in SaaS mode an account with a plan gets the feed', function () {
        config(['saas.enabled' => true]);
        $this->user->forceFill(['lifetime_purchased_at' => now()])->save();

        fetchFeed()->assertOk();
    });

    test('is rate limited per feed', function () {
        foreach (range(1, 20) as $attempt) {
            fetchFeed()->assertOk();
        }

        fetchFeed()->assertTooManyRequests();
    });
});
