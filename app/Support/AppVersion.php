<?php

namespace App\Support;

/**
 * The running release, as `package.json` declares it (the release process bumps it).
 */
final class AppVersion
{
    private static ?string $version = null;

    public static function current(): string
    {
        if (self::$version !== null) {
            return self::$version;
        }

        $manifest = json_decode((string) @file_get_contents(base_path('package.json')), true);
        $version = is_array($manifest) && is_string($manifest['version'] ?? null) ? $manifest['version'] : 'unknown';

        return self::$version = $version;
    }
}
