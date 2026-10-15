<?php

use Illuminate\Support\Facades\Route;

beforeEach(function () {
    Route::get('_test/url', fn () => url('/').' '.(request()->isSecure() ? 'secure' : 'insecure'));
});

test('forwarded headers are ignored by default', function () {
    $this->get('_test/url', ['X-Forwarded-Proto' => 'https', 'X-Forwarded-Host' => 'plan.example.com'])
        ->assertContent(config('app.url').' insecure');
});

test('TRUSTED_PROXIES makes URLs follow the proxy that terminates TLS', function () {
    config(['trustedproxy.proxies' => '*']);

    $this->get('_test/url', ['X-Forwarded-Proto' => 'https', 'X-Forwarded-Host' => 'plan.example.com'])
        ->assertContent('https://plan.example.com secure');
});
