<?php

namespace App\Auth;

use App\Models\User;

/**
 * Sign-up is open unless `REGISTRATION_ENABLED=false`, for private instances
 * where only existing accounts may log in. An instance with no users yet stays
 * open anyway, so its first account can still be created.
 */
final class Registration
{
    private static function enabled(): bool
    {
        return (bool) config('auth.registration.enabled');
    }

    public static function open(): bool
    {
        return self::enabled() || ! User::query()->exists();
    }
}
