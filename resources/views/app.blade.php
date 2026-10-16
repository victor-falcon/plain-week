<!DOCTYPE html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}" dir="{{ in_array(app()->getLocale(), config('app.rtl_locales')) ? 'rtl' : 'ltr' }}" @class(['dark' => ($appearance ?? 'system') == 'dark'])>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        @if (config('app.noindex'))
            <meta name="robots" content="noindex, nofollow">
        @endif

        {{-- Inline script to detect system dark mode preference and apply it immediately --}}
        <script>
            (function() {
                const appearance = '{{ $appearance ?? "system" }}';

                if (appearance === 'system') {
                    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

                    if (prefersDark) {
                        document.documentElement.classList.add('dark');
                    }
                }
            })();
        </script>

        {{-- Inline style to set the HTML background color; keep in sync with --background in resources/css/app.css --}}
        <style>
            html {
                background-color: oklch(1 0 0);
            }

            html.dark {
                background-color: oklch(0.147 0.004 49.25);
            }
        </style>

        {{-- Link previews (Open Graph, X/Twitter). URLs come from APP_URL so every self-hosted instance points at itself;
             every page shares the home page's card. The image is rendered from resources/images/marketing
             (docs/stack.md#marketing-images). --}}
        @php($siteUrl = rtrim(config('app.url'), '/'))
        @php($siteDescription = 'A minimal weekly planner and to-do list. Free, open source and offline-first.')
        <meta name="description" content="{{ $siteDescription }}">
        <meta property="og:type" content="website">
        <meta property="og:site_name" content="{{ config('app.name') }}">
        <meta property="og:title" content="{{ config('app.name') }}">
        <meta property="og:description" content="{{ $siteDescription }}">
        <meta property="og:url" content="{{ $siteUrl }}/">
        <meta property="og:image" content="{{ $siteUrl }}/og-image.png">
        <meta property="og:image:width" content="1200">
        <meta property="og:image:height" content="630">
        <meta property="og:image:alt" content="Plain Week: your week, plain and simple. A weekly planner with one column per day.">
        <meta name="twitter:card" content="summary_large_image">
        <meta name="twitter:title" content="{{ config('app.name') }}">
        <meta name="twitter:description" content="{{ $siteDescription }}">
        <meta name="twitter:image" content="{{ $siteUrl }}/og-image.png">
        <meta name="twitter:image:alt" content="Plain Week: your week, plain and simple. A weekly planner with one column per day.">

        <link rel="icon" href="/favicon.ico" sizes="32x32">
        <link rel="icon" href="/favicon.svg" type="image/svg+xml">
        <link rel="apple-touch-icon" href="/apple-touch-icon.png">

        {{-- Web app manifest (built by vite-plugin-pwa); theme colors follow --background in resources/css/app.css --}}
        @if (file_exists(public_path('build/manifest.webmanifest')))
            <link rel="manifest" href="/build/manifest.webmanifest">
        @endif
        <meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)">
        <meta name="theme-color" content="#0c0a09" media="(prefers-color-scheme: dark)">

        @viteReactRefresh
        @vite(['resources/css/app.css', 'resources/js/app.tsx', "resources/js/pages/{$page['component']}.tsx"])
        <x-inertia::head>
            <title>{{ config('app.name', 'Plain Week') }}</title>
        </x-inertia::head>
    </head>
    <body class="font-sans antialiased">
        <x-inertia::app />
    </body>
</html>
