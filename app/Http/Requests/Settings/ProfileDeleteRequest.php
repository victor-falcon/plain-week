<?php

namespace App\Http\Requests\Settings;

use App\Concerns\ConfirmsPasswordlessUsers;
use App\Concerns\PasswordValidationRules;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

class ProfileDeleteRequest extends FormRequest
{
    use ConfirmsPasswordlessUsers, PasswordValidationRules;

    /**
     * Get the validation rules that apply to the request.
     *
     * An account without a password (created through the IdP) confirms it is them first instead.
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return $this->userHasPassword() ? ['password' => $this->currentPasswordRules()] : [];
    }

    /**
     * @return array<int, callable(Validator): void>
     */
    public function after(): array
    {
        return [$this->requireRecentConfirmation(__('Confirm it is you before deleting your account.'))];
    }
}
