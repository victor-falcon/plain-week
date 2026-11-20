<?php

namespace App\Http\Requests\Sync;

use App\Tasks\TaskRecordRules;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

class PushRequest extends FormRequest
{
    /**
     * The maximum number of records accepted in one push.
     */
    public const int MAX_RECORDS = 500;

    /**
     * Get the validation rules that apply to the request. The record rules are shared with server-side writes
     * ({@see TaskRecordRules}).
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'tasks' => ['present', 'list', 'max:'.self::MAX_RECORDS],
            'tasks.*' => ['required', 'array'],
            ...TaskRecordRules::rules('tasks.*.'),
        ];
    }

    /**
     * Check the recurrence invariants that span several fields of a record ({@see TaskRecordRules::violations}).
     *
     * @return array<int, callable(Validator): void>
     */
    public function after(): array
    {
        return [
            fn (Validator $validator) => TaskRecordRules::checkInvariants($validator, 'tasks'),
        ];
    }

    /**
     * The validated wire records.
     *
     * @return list<array<string, mixed>>
     */
    public function records(): array
    {
        /** @var list<array<string, mixed>> */
        return $this->validated('tasks');
    }
}
