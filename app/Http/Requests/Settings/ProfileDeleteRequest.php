<?php

namespace App\Http\Requests\Settings;

use App\Auth\PasswordConfirmation;
use App\Concerns\PasswordValidationRules;
use App\Models\User;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

class ProfileDeleteRequest extends FormRequest
{
    use PasswordValidationRules;

    /**
     * Get the validation rules that apply to the request.
     *
     * An account without a password (created through the IdP) confirms at the IdP first instead.
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return $this->hasPassword() ? ['password' => $this->currentPasswordRules()] : [];
    }

    /**
     * @return array<int, callable(Validator): void>
     */
    public function after(): array
    {
        return [
            function (Validator $validator): void {
                if (! $this->hasPassword() && ! PasswordConfirmation::recent($this)) {
                    $validator->errors()->add('password', __('Confirm it is you before deleting your account.'));
                }
            },
        ];
    }

    private function hasPassword(): bool
    {
        $user = $this->user();

        return $user instanceof User && $user->password !== null;
    }
}
