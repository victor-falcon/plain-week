<?php

use App\Http\Middleware\HandleInertiaRequests;
use App\Models\PushSubscription;
use App\Models\Task;
use App\Models\User;
use App\Support\Translations;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\File;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\Support\FakePushSender;

uses(RefreshDatabase::class);

beforeEach(function () {
    $this->translations = storage_path('framework/testing/translations-'.uniqid());
    File::ensureDirectoryExists($this->translations);
    config(['app.translations_path' => $this->translations]);
});

afterEach(fn () => File::deleteDirectory($this->translations));

/**
 * @param  array<string, mixed>|string  $messages
 */
function translationFile(string $locale, array|string $messages): void
{
    File::put(
        test()->translations."/{$locale}.json",
        is_string($messages) ? $messages : json_encode($messages, JSON_THROW_ON_ERROR),
    );
}

describe('available locales', function () {
    test('English alone without translation files', function () {
        expect(app(Translations::class)->available())->toBe(['en']);
    });

    test('English first, then each file named like a locale', function () {
        translationFile('pt-BR', []);
        translationFile('de', []);
        translationFile('en', []);
        translationFile('not a locale', []);
        File::put($this->translations.'/notes.txt', 'ignored');

        expect(app(Translations::class)->available())->toBe(['en', 'de', 'pt-BR']);
    });
});

describe('the request locale', function () {
    beforeEach(function () {
        translationFile('de', ['planner.today' => 'Heute']);
        translationFile('pt_BR', []);
    });

    test('follows the browser languages', function (?string $acceptLanguage, string $locale) {
        $this->get('/', $acceptLanguage === null ? [] : ['Accept-Language' => $acceptLanguage])
            ->assertInertia(fn (Assert $page) => $page->where('i18n.locale', $locale));
    })->with([
        'no header' => [null, 'en'],
        'exact' => ['de', 'de'],
        'region of an offered language' => ['de-AT,de;q=0.9', 'de'],
        'language of an offered region' => ['pt', 'pt_BR'],
        'hyphen for underscore' => ['pt-BR', 'pt_BR'],
        'first match by preference' => ['fr-FR,de;q=0.8,en;q=0.5', 'de'],
        'English before a later language' => ['en-US,de;q=0.5', 'en'],
        'nothing offered' => ['fr', 'en'],
    ]);

    test('falls back to APP_LOCALE when the instance offers it', function () {
        config(['app.locale' => 'de']);

        $this->get('/', ['Accept-Language' => 'fr'])
            ->assertInertia(fn (Assert $page) => $page->where('i18n.locale', 'de'));
    });

    test('follows the account language over the browser', function () {
        $this->actingAs(User::factory()->create(['language' => 'de']))
            ->get('/', ['Accept-Language' => 'en'])
            ->assertInertia(fn (Assert $page) => $page->where('i18n.locale', 'de'));
    });

    test('ignores an account language the instance no longer offers', function () {
        $this->actingAs(User::factory()->create(['language' => 'it']))
            ->get('/', ['Accept-Language' => 'pt-BR'])
            ->assertInertia(fn (Assert $page) => $page->where('i18n.locale', 'pt_BR'));
    });

    test('sets the html lang and dir and varies on Accept-Language', function () {
        translationFile('ar', []);

        $this->get('/', ['Accept-Language' => 'pt-BR'])
            ->assertSee('<html lang="pt-BR" dir="ltr"', false)
            ->assertHeader('Vary');

        expect($this->get('/', ['Accept-Language' => 'ar-EG'])->getContent())
            ->toContain('<html lang="ar" dir="rtl"');
    });
});

describe('the i18n page props', function () {
    test('carry the locale, the offered locales and the translations over English', function () {
        translationFile('en', ['planner.today' => 'Today!', 'common.cancel' => 'Nope']);
        translationFile('de', ['planner.today' => 'Heute', 'task.repeatDays' => ['one' => 'Jeden Tag', 'other' => 'Alle {count} Tage']]);

        $this->get('/', ['Accept-Language' => 'de'])
            ->assertInertia(fn (Assert $page) => $page
                ->where('i18n.locale', 'de')
                ->where('i18n.locales', ['en', 'de'])
                ->where('i18n.messages', [
                    'planner.today' => 'Heute',
                    'common.cancel' => 'Nope',
                    'task.repeatDays' => ['one' => 'Jeden Tag', 'other' => 'Alle {count} Tage'],
                ]));
    });

    test('are empty without translation files', function () {
        $this->get('/')->assertInertia(fn (Assert $page) => $page
            ->where('i18n.locale', 'en')
            ->where('i18n.locales', ['en'])
            ->where('i18n.messages', []));
    });

    test('send the translations once per locale and content', function () {
        translationFile('de', ['planner.today' => 'Heute']);

        $headers = ['Accept-Language' => 'de', 'X-Inertia' => 'true', 'X-Inertia-Version' => (string) app(HandleInertiaRequests::class)->version(request())];
        $first = $this->get('/', $headers);
        $key = collect($first->json('onceProps'))->keys()->first(fn (string $key) => str_starts_with($key, 'i18n.de.'));

        expect($key)->not->toBeNull()
            ->and($first->json('props.i18n.messages'))->toBe(['planner.today' => 'Heute']);

        $again = $this->get('/', [...$headers, 'X-Inertia-Except-Once-Props' => $key]);
        expect($again->json('props.i18n'))->not->toHaveKey('messages');

        translationFile('de', ['planner.today' => 'Heute!']);
        app()->forgetScopedInstances();
        $changed = $this->get('/', [...$headers, 'X-Inertia-Except-Once-Props' => $key]);
        expect($changed->json('props.i18n.messages'))->toBe(['planner.today' => 'Heute!']);
    });

    test('ignore a broken file instead of failing', function (string $contents) {
        translationFile('de', $contents);

        $this->get('/', ['Accept-Language' => 'de'])
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page->where('i18n.messages', []));
    })->with([
        'invalid JSON' => ['{"planner.today": '],
        'a list' => ['["Heute"]'],
        'a string' => ['"Heute"'],
    ]);

    test('drop values that are neither texts nor plurals', function () {
        translationFile('de', ['a' => 'ok', 'b' => 3, 'c' => ['x', 'y'], 'd' => ['one' => 'x', 'other' => ['y']], 'e' => null]);

        expect(app(Translations::class)->overrides('de'))->toBe(['a' => 'ok']);
    });
});

describe('server messages', function () {
    test('use the request language, with the translation files over Laravel and the app', function () {
        translationFile('de', [
            'Profile updated.' => 'Profil gespeichert.',
            'validation.required' => 'Das Feld :attribute fehlt.',
        ]);
        $user = User::factory()->create(['language' => 'de']);

        $this->actingAs($user)
            ->patch(route('profile.update'), ['name' => 'Ana', 'email' => $user->email])
            ->assertInertiaFlash('toast.message', 'Profil gespeichert.');

        $this->actingAs($user)
            ->from(route('profile.edit'))
            ->patch(route('profile.update'), ['name' => '', 'email' => $user->email])
            ->assertSessionHasErrors(['name' => 'Das Feld name fehlt.']);
    });

    test('can reword English', function () {
        translationFile('en', ['Profile updated.' => 'All set.']);
        $user = User::factory()->create();

        $this->actingAs($user)
            ->patch(route('profile.update'), ['name' => 'Ana', 'email' => $user->email])
            ->assertInertiaFlash('toast.message', 'All set.');
    });
});

describe('the account language', function () {
    beforeEach(fn () => translationFile('de', []));

    test('is saved, or cleared to follow the browser', function () {
        $user = User::factory()->create();

        $this->actingAs($user)->from(route('preferences.edit'))
            ->patch(route('language.update'), ['language' => 'de'])
            ->assertRedirect(route('preferences.edit'));
        expect($user->fresh()->language)->toBe('de');

        $this->actingAs($user)->patch(route('language.update'), ['language' => null]);
        expect($user->fresh()->language)->toBeNull();
    });

    test('must be offered by the instance', function () {
        $user = User::factory()->create();

        $this->actingAs($user)
            ->patch(route('language.update'), ['language' => 'fr'])
            ->assertSessionHasErrors('language');
        expect($user->fresh()->language)->toBeNull();
    });

    test('needs a session', function () {
        $this->patch(route('language.update'), ['language' => 'de'])->assertRedirect(route('login'));
    });

    test('is the preferred locale for emails and notifications, else the sign-up language', function () {
        expect(User::factory()->make(['language' => 'de', 'locale' => 'es'])->preferredLocale())->toBe('de')
            ->and(User::factory()->make(['language' => null, 'locale' => 'en'])->preferredLocale())->toBe('en')
            ->and(User::factory()->make(['language' => 'it', 'locale' => 'es'])->preferredLocale())->toBeNull();
    });
});

test('push notifications speak the account language', function () {
    translationFile('de', ['Today' => 'Heute']);
    config([
        'services.webpush.public_key' => 'public-key',
        'services.webpush.private_key' => 'private-key',
        'services.webpush.subject' => 'mailto:admin@example.com',
    ]);
    $sender = FakePushSender::install();
    $user = User::factory()->create(['timezone' => 'Europe/Madrid', 'language' => 'de']);
    $user->pushSubscriptions()->create([
        'endpoint' => 'https://push.example.com/1',
        'endpoint_hash' => PushSubscription::hashEndpoint('https://push.example.com/1'),
        'p256dh' => 'p256dh',
        'auth' => 'auth',
    ]);
    Task::factory()->for($user)->create(['text' => 'Call mom', 'date' => '2026-10-27']);

    $this->travelTo(CarbonImmutable::parse('2026-10-27 08:00:00', 'Europe/Madrid'));
    $this->artisan('notifications:send')->assertSuccessful();

    expect($sender->messages()[0]['body'])->toBe('Heute')
        ->and(app()->getLocale())->toBe('en');
});
