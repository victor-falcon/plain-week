<?php

namespace App\Http\Requests\Sync;

use App\Casts\UtcMillisDateTime;
use App\Enums\TaskColor;
use App\Models\TaskLabel;
use App\Tasks\TaskRecordRules;
use Closure;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

class PushRequest extends FormRequest
{
    /**
     * The maximum number of records accepted in one push.
     */
    public const int MAX_RECORDS = 500;

    /**
     * Get the validation rules that apply to the request. The task record rules are shared with server-side writes
     * ({@see TaskRecordRules}). `labels` is optional: clients before sync format 3 never send it.
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        $labelColors = array_values(array_filter(TaskColor::cases(), fn (TaskColor $color) => $color->isLabel()));

        return [
            'tasks' => ['present', 'list', 'max:'.self::MAX_RECORDS],
            'tasks.*' => ['required', 'array'],
            ...TaskRecordRules::rules('tasks.*.'),
            'labels' => ['sometimes', 'list', 'max:'.count($labelColors)],
            'labels.*' => ['required', 'array:color,name,updated_at'],
            'labels.*.color' => ['required', 'distinct', Rule::enum(TaskColor::class)->only($labelColors)],
            'labels.*.name' => ['present', 'string', $this->labelNameLength(...)],
            'labels.*.updated_at' => ['required', 'date_format:'.UtcMillisDateTime::WIRE_FORMAT],
        ];
    }

    /**
     * A label name is at most {@see TaskLabel::MAX_NAME_LENGTH} characters once trimmed.
     */
    private function labelNameLength(string $attribute, mixed $value, Closure $fail): void
    {
        if (is_string($value) && mb_strlen(trim($value)) > TaskLabel::MAX_NAME_LENGTH) {
            $fail("The {$attribute} field must not be greater than ".TaskLabel::MAX_NAME_LENGTH.' characters.');
        }
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

    /**
     * The validated label records (none from clients that do not sync labels).
     *
     * @return list<array{color: string, name: string, updated_at: string}>
     */
    public function labels(): array
    {
        /** @var list<array{color: string, name: string, updated_at: string}> */
        return $this->validated('labels', []);
    }
}
