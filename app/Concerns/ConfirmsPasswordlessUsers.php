<?php

namespace App\Concerns;

use App\Auth\PasswordConfirmation;
use App\Models\User;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

/**
 * For form requests that ask for the current password: an account without one (created through single sign-on) must
 * have confirmed it is them recently instead (at the IdP, or with a passkey).
 *
 * @mixin FormRequest
 */
trait ConfirmsPasswordlessUsers
{
    protected function userHasPassword(): bool
    {
        $user = $this->user();

        return $user instanceof User && $user->hasPassword();
    }

    /**
     * An `after()` hook that fails on `password` with `$message` for a password-less account without a recent
     * confirmation.
     *
     * @return callable(Validator): void
     */
    protected function requireRecentConfirmation(string $message): callable
    {
        return function (Validator $validator) use ($message): void {
            if (! $this->userHasPassword() && ! PasswordConfirmation::recent($this)) {
                $validator->errors()->add('password', $message);
            }
        };
    }
}
