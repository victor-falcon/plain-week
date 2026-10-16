<?php

use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

test('pages carry Open Graph and Twitter card tags pointing at the instance', function () {
    config(['app.url' => 'https://plan.example.test/', 'app.name' => 'Plain Week']);

    $this->get(route('home'))
        ->assertOk()
        ->assertSee('<meta property="og:type" content="website">', escape: false)
        ->assertSee('<meta property="og:title" content="Plain Week">', escape: false)
        ->assertSee('<meta property="og:description" content="A minimal weekly planner and to-do list. Free, open source and offline-first.">', escape: false)
        ->assertSee('<meta property="og:url" content="https://plan.example.test/">', escape: false)
        ->assertSee('<meta property="og:image" content="https://plan.example.test/og-image.png">', escape: false)
        ->assertSee('<meta property="og:image:width" content="1200">', escape: false)
        ->assertSee('<meta property="og:image:height" content="630">', escape: false)
        ->assertSee('<meta property="og:image:alt"', escape: false)
        ->assertSee('<meta name="twitter:card" content="summary_large_image">', escape: false)
        ->assertSee('<meta name="twitter:image" content="https://plan.example.test/og-image.png">', escape: false)
        ->assertSee('<meta name="twitter:image:alt"', escape: false);

    $this->get(route('login'))
        ->assertOk()
        ->assertSee('<meta property="og:image" content="https://plan.example.test/og-image.png">', escape: false);
});

test('APP_NOINDEX keeps the link preview tags', function () {
    config(['app.noindex' => true]);

    $this->get(route('home'))
        ->assertOk()
        ->assertSee('<meta name="robots" content="noindex, nofollow">', escape: false)
        ->assertSee('<meta property="og:image"', escape: false)
        ->assertSee('<meta name="twitter:card" content="summary_large_image">', escape: false);
});

test('the og:image is a 1200×630 PNG', function () {
    $size = getimagesize(public_path('og-image.png'));

    expect($size)->not->toBeFalse()
        ->and($size[0])->toBe(1200)
        ->and($size[1])->toBe(630)
        ->and($size['mime'])->toBe('image/png');
});
