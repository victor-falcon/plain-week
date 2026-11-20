<?php

namespace App\Tasks;

use App\Casts\UtcMillisDateTime;
use App\Enums\TaskColor;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Support\Facades\Validator as ValidatorFactory;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Illuminate\Validation\Validator;

/**
 * The validation rules of one task wire record, shared by the sync push (`PushRequest`) and server-side writes
 * (`TaskRepository`), so the server never stores a row a client would be refused to push.
 */
final class TaskRecordRules
{
    /**
     * The largest `every` of a daily rule.
     */
    public const int MAX_EVERY_DAYS = 365;

    private const string SERIES_IS_NOT_EXCEPTION = 'A recurring task cannot be an exception of a series.';

    /**
     * The field rules of a record whose fields sit under `$prefix` (for example `tasks.*.`).
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public static function rules(string $prefix): array
    {
        $timestamp = 'date_format:'.UtcMillisDateTime::WIRE_FORMAT;
        $p = $prefix;

        return [
            "{$p}id" => ['required', 'string', 'uuid', 'lowercase'],
            "{$p}text" => ['present', 'string'],
            "{$p}date" => ['present', 'nullable', 'date_format:Y-m-d'],
            "{$p}someday_column" => ['present', 'nullable', "required_if:{$p}date,null", 'integer', 'between:0,2'],
            "{$p}position" => ['required', 'string', 'max:255'],
            "{$p}done" => ['required', 'boolean:strict'],
            "{$p}done_at" => ['present', 'nullable', $timestamp],
            "{$p}color" => ['required', Rule::enum(TaskColor::class)],
            "{$p}time" => ['present', 'nullable', 'date_format:H:i'],
            "{$p}notes" => ['present', 'string'],
            "{$p}subtasks" => ['present', 'list'],
            "{$p}subtasks.*" => ['required', 'array'],
            "{$p}subtasks.*.id" => ['required', 'string', 'max:255'],
            "{$p}subtasks.*.text" => ['present', 'string'],
            "{$p}subtasks.*.done" => ['required', 'boolean:strict'],
            // The recurrence keys are optional (all three or none) so clients from before v0.0.2 keep syncing plain
            // tasks; PushTasks refuses their writes to a series or an exception. Cross-field invariants are in
            // violations().
            "{$p}recurrence" => [
                "present_with:{$p}series_id,{$p}occurrence_date", 'nullable', 'array:type,every,weekdays,day,until', 'required_array_keys:type',
            ],
            "{$p}recurrence.type" => ["required_with:{$p}recurrence", 'string', 'in:daily,weekly,monthly'],
            "{$p}recurrence.every" => [
                "required_if:{$p}recurrence.type,daily", "prohibited_unless:{$p}recurrence.type,daily",
                'integer:strict', 'between:1,'.self::MAX_EVERY_DAYS,
            ],
            "{$p}recurrence.weekdays" => [
                "required_if:{$p}recurrence.type,weekly", "prohibited_unless:{$p}recurrence.type,weekly", 'list',
                'min:1', 'max:7',
            ],
            "{$p}recurrence.weekdays.*" => ['integer:strict', 'between:1,7'],
            "{$p}recurrence.day" => [
                "required_if:{$p}recurrence.type,monthly", "prohibited_unless:{$p}recurrence.type,monthly",
                'integer:strict', 'between:1,31',
            ],
            "{$p}recurrence.until" => ['sometimes', 'nullable', 'date_format:Y-m-d'],
            "{$p}series_id" => [
                "present_with:{$p}recurrence,{$p}occurrence_date", 'nullable', 'string', 'uuid', 'lowercase', "different:{$p}id",
            ],
            "{$p}occurrence_date" => [
                "present_with:{$p}recurrence,{$p}series_id", 'nullable', 'date_format:Y-m-d',
            ],
            "{$p}created_at" => ['required', $timestamp],
            "{$p}updated_at" => ['required', $timestamp],
            "{$p}deleted_at" => ['present', 'nullable', $timestamp],
        ];
    }

    /**
     * The recurrence invariants that span several fields of a record, keyed by field.
     *
     * A row is plain (no recurrence fields), a series (`recurrence` and a `date`, no `series_id`/`occurrence_date`) or
     * an exception (`series_id` and `occurrence_date`, no `recurrence`). Tombstones skip these checks, so deleting a
     * row is never refused (for example a series ended before its start date when it is deleted from its first day).
     *
     * @param  array<string, mixed>  $record  A record that passed {@see rules}.
     * @return array<string, string>
     */
    public static function violations(array $record): array
    {
        if ($record['deleted_at'] !== null) {
            return [];
        }

        /** @var array{type: string, every?: int, weekdays?: list<int>, day?: int, until?: string|null}|null $recurrence */
        $recurrence = $record['recurrence'] ?? null;
        $seriesId = $record['series_id'] ?? null;
        $occurrenceDate = $record['occurrence_date'] ?? null;

        if ($recurrence !== null) {
            return array_filter([
                'date' => $record['date'] === null ? 'A recurring task needs a date.' : null,
                'series_id' => $seriesId !== null ? self::SERIES_IS_NOT_EXCEPTION : null,
                'occurrence_date' => $occurrenceDate !== null ? self::SERIES_IS_NOT_EXCEPTION : null,
                'recurrence.weekdays' => isset($recurrence['weekdays']) && ! self::isStrictlyAscending($recurrence['weekdays'])
                    ? 'The weekdays must be unique and sorted.' : null,
                'recurrence.until' => isset($recurrence['until']) && $record['date'] !== null && $recurrence['until'] < $record['date']
                    ? 'The end date cannot be before the task date.' : null,
            ]);
        }

        return array_filter([
            'series_id' => $seriesId === null && $occurrenceDate !== null ? 'An exception needs its series.' : null,
            'occurrence_date' => $seriesId !== null && $occurrenceDate === null ? 'An exception needs its occurrence date.' : null,
        ]);
    }

    /**
     * Adds the {@see violations} of the records under `$key` to a validator that passed the field rules.
     */
    public static function checkInvariants(Validator $validator, string $key): void
    {
        if ($validator->errors()->isNotEmpty()) {
            return;
        }

        /** @var list<array<string, mixed>> $records */
        $records = $validator->getData()[$key];

        foreach ($records as $index => $record) {
            foreach (self::violations($record) as $field => $message) {
                $validator->errors()->add("{$key}.{$index}.{$field}", $message);
            }
        }
    }

    /**
     * Validates records exactly like a push of them would, one record at a time (a single validator over thousands of
     * records gets slow).
     *
     * @param  list<array<string, mixed>>  $records
     * @param  array<string, ValidationRule|array<mixed>|string>|null  $rules  {@see rules} with no prefix, or a variant.
     *
     * @throws ValidationException
     */
    public static function validate(array $records, ?array $rules = null): void
    {
        $rules ??= self::rules('');

        foreach ($records as $record) {
            $validator = ValidatorFactory::make($record, $rules);

            $validator->after(function (Validator $validator) use ($record) {
                if ($validator->errors()->isEmpty()) {
                    foreach (self::violations($record) as $field => $message) {
                        $validator->errors()->add($field, $message);
                    }
                }
            });
            $validator->validate();
        }
    }

    /**
     * @param  list<int>  $values
     */
    private static function isStrictlyAscending(array $values): bool
    {
        for ($i = 1; $i < count($values); $i++) {
            if ($values[$i] <= $values[$i - 1]) {
                return false;
            }
        }

        return true;
    }
}
