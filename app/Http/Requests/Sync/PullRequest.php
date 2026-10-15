<?php

namespace App\Http\Requests\Sync;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;

class PullRequest extends FormRequest
{
    public const int DEFAULT_LIMIT = 500;

    public const int MAX_LIMIT = 1000;

    /**
     * Get the validation rules that apply to the request.
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'cursor' => ['sometimes', 'integer', 'min:0'],
            'limit' => ['sometimes', 'integer', 'between:1,'.self::MAX_LIMIT],
        ];
    }

    public function cursor(): int
    {
        return $this->integer('cursor');
    }

    public function limit(): int
    {
        return $this->integer('limit', self::DEFAULT_LIMIT);
    }

    /**
     * What the client understands (see SyncFormat).
     */
    public function syncFormat(): int
    {
        return SyncFormat::of($this);
    }
}
