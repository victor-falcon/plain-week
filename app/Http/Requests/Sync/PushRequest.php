<?php

namespace App\Http\Requests\Sync;

use App\Casts\UtcMillisDateTime;
use App\Enums\TaskColor;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class PushRequest extends FormRequest
{
    /**
     * The maximum number of records accepted in one push.
     */
    public const int MAX_RECORDS = 500;

    /**
     * Get the validation rules that apply to the request.
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        $timestamp = 'date_format:'.UtcMillisDateTime::WIRE_FORMAT;

        return [
            'tasks' => ['present', 'list', 'max:'.self::MAX_RECORDS],
            'tasks.*' => ['required', 'array'],
            'tasks.*.id' => ['required', 'string', 'uuid', 'lowercase'],
            'tasks.*.text' => ['present', 'string'],
            'tasks.*.date' => ['present', 'nullable', 'date_format:Y-m-d'],
            'tasks.*.someday_column' => ['present', 'nullable', 'required_if:tasks.*.date,null', 'integer', 'between:0,2'],
            'tasks.*.position' => ['required', 'string', 'max:255'],
            'tasks.*.done' => ['required', 'boolean:strict'],
            'tasks.*.done_at' => ['present', 'nullable', $timestamp],
            'tasks.*.color' => ['required', Rule::enum(TaskColor::class)],
            'tasks.*.time' => ['present', 'nullable', 'date_format:H:i'],
            'tasks.*.notes' => ['present', 'string'],
            'tasks.*.subtasks' => ['present', 'list'],
            'tasks.*.subtasks.*' => ['required', 'array'],
            'tasks.*.subtasks.*.id' => ['required', 'string', 'max:255'],
            'tasks.*.subtasks.*.text' => ['present', 'string'],
            'tasks.*.subtasks.*.done' => ['required', 'boolean:strict'],
            'tasks.*.created_at' => ['required', $timestamp],
            'tasks.*.updated_at' => ['required', $timestamp],
            'tasks.*.deleted_at' => ['present', 'nullable', $timestamp],
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
