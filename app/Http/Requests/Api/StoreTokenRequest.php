<?php

namespace App\Http\Requests\Api;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;

class StoreTokenRequest extends FormRequest
{
    /**
     * Get the validation rules that apply to the request.
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'email' => ['required', 'string', 'email', 'max:255'],
            'password' => ['required', 'string'],
            // The device name, shown to the user when they manage their sessions.
            'name' => ['sometimes', 'string', 'max:100'],
            // The TOTP or recovery code, required when the account has confirmed 2FA.
            'code' => ['sometimes', 'string', 'max:32'],
        ];
    }
}
