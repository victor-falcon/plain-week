<?php

use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

test('instances are indexable by default', function () {
    $this->get(route('home'))
        ->assertOk()
        ->assertHeaderMissing('X-Robots-Tag')
        ->assertDontSee('<meta name="robots"', escape: false);

    $this->get(route('robots'))
        ->assertOk()
        ->assertHeader('Content-Type', 'text/plain; charset=UTF-8')
        ->assertContent("User-agent: *\nDisallow:\n");
});

test('APP_NOINDEX closes the instance to crawlers', function () {
    config(['app.noindex' => true]);

    $this->get(route('home'))
        ->assertOk()
        ->assertHeader('X-Robots-Tag', 'noindex, nofollow')
        ->assertSee('<meta name="robots" content="noindex, nofollow">', escape: false);

    $this->get(route('robots'))
        ->assertOk()
        ->assertHeader('X-Robots-Tag', 'noindex, nofollow')
        ->assertContent("User-agent: *\nDisallow: /\n");

    $this->get(route('login'))->assertHeader('X-Robots-Tag', 'noindex, nofollow');
    $this->getJson(route('sync.pull'))->assertUnauthorized()->assertHeader('X-Robots-Tag', 'noindex, nofollow');
    $this->get('/up')->assertOk()->assertHeader('X-Robots-Tag', 'noindex, nofollow');
});
