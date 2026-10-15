<?php

use App\Http\Middleware\AddRobotsTag;
use App\Http\Middleware\HandleAppearance;
use App\Http\Middleware\HandleInertiaRequests;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Middleware\AddLinkHeadersForPreloadedAssets;
use Illuminate\Http\Request;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->append(AddRobotsTag::class);

        $middleware->encryptCookies(except: ['appearance', 'sidebar_state']);

        // Sync payloads must round-trip byte for byte (empty notes, leading spaces).
        $isSync = fn (Request $request) => $request->is('sync/*');
        $middleware->trimStrings(except: [$isSync]);
        $middleware->convertEmptyStringsToNull(except: [$isSync]);

        $middleware->web(append: [
            HandleAppearance::class,
            HandleInertiaRequests::class,
            AddLinkHeadersForPreloadedAssets::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request) => $request->is('api/*', 'sync/*') || $request->expectsJson(),
        );
    })->create();
