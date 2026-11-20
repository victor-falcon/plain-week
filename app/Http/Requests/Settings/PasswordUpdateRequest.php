<?php

namespace App\Http\Requests\Settings;

use App\Auth\PasswordConfirmation;
use App\Concerns\PasswordValidationRules;
use App\Models\User;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

class PasswordUpdateRequest extends FormRequest
{
    use PasswordValidationRules;

    /**
     * Get the validation rules that apply to the request.
     *
     * An account without a password (created through the IdP) sets one without a current password, but only right
     * after confirming it is them at the IdP.
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            ...($this->hasPassword() ? ['current_password' => $this->currentPasswordRules()] : []),
            'password' => $this->passwordRules(),
        ];
    }

    /**
     * @return array<int, callable(Validator): void>
     */
    public function after(): array
    {
        return [
            function (Validator $validator): void {
                if (! $this->hasPassword() && ! PasswordConfirmation::recent($this)) {
                    $validator->errors()->add('password', __('Confirm it is you before setting a password.'));
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
