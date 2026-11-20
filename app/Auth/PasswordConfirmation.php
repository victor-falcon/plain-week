<?php

namespace App\Auth;

use Illuminate\Http\Request;

/**
 * Whether the user passed the "confirm password" step recently (Laravel's `auth.password_confirmed_at`, valid for
 * `auth.password_timeout`): with their password, a passkey or, for a password-less account, by logging in at the IdP
 * again. Password-less accounts need it where others type their current password.
 */
final class PasswordConfirmation
{
    public static function recent(Request $request): bool
    {
        $confirmedAt = (int) $request->session()->get('auth.password_confirmed_at', 0);

        return time() - $confirmedAt < (int) config('auth.password_timeout', 10800);
    }
}
