<?php

namespace App\Mcp\Support;

use App\Enums\TaskColor;
use App\Tasks\Scope;
use App\Tasks\TaskRecordRules;
use Illuminate\Contracts\JsonSchema\JsonSchema;
use Illuminate\JsonSchema\Types\Type;
use Illuminate\Validation\Rule;

/**
 * JSON schema pieces and validation rules the planner tools share.
 */
final class Schemas
{
    public const string ID = 'The task id, or an occurrence id (`<series id>:<YYYY-MM-DD>`) for one date of a recurring task.';

    public static function id(JsonSchema $schema, string $description = self::ID): Type
    {
        return $schema->string()->description($description)->required();
    }

    public static function date(JsonSchema $schema, string $description): Type
    {
        return $schema->string()->format('date')->description($description);
    }

    public static function scope(JsonSchema $schema, Scope $default): Type
    {
        return $schema->string()->enum(array_column(Scope::cases(), 'value'))->default($default->value)
            ->description('For an occurrence of a recurring task: `this` changes only that date, `future` that date and every later one (the series is split there). Ignored for a plain task. Default `'.$default->value.'`.');
    }

    public static function color(JsonSchema $schema): Type
    {
        return $schema->string()->enum(array_column(TaskColor::cases(), 'value'))->description('Task color; `none` for no color.');
    }

    public static function time(JsonSchema $schema): Type
    {
        return $schema->string()->pattern('^([01]\d|2[0-3]):[0-5]\d$')->nullable()
            ->description('`HH:mm` (24 h) in the user\'s time zone; null for an all-day task.');
    }

    public static function recurrence(JsonSchema $schema): Type
    {
        return $schema->object([
            'type' => $schema->string()->enum(['daily', 'weekly', 'monthly'])->required(),
            'every' => $schema->integer()->min(1)->max(TaskRecordRules::MAX_EVERY_DAYS)->description('daily only: every N days (1 = every day).'),
            'weekdays' => $schema->array()->items($schema->integer()->min(1)->max(7))->description('weekly only: ISO weekdays, 1 = Monday … 7 = Sunday.'),
            'day' => $schema->integer()->min(1)->max(31)->description('monthly only: day of the month (31 means the last day in shorter months).'),
            'until' => $schema->string()->format('date')->nullable()->description('Last date it may occur on (`YYYY-MM-DD`), or null to repeat forever.'),
        ])->withoutAdditionalProperties()->description('A repeat rule: `{"type":"daily","every":1}`, `{"type":"weekly","weekdays":[1,3]}` or `{"type":"monthly","day":15}`, each with an optional `until`. The task\'s date is the first occurrence.');
    }

    /**
     * @return array<string, mixed>
     */
    public static function scopeRules(string $key = 'scope'): array
    {
        return [$key => ['sometimes', Rule::enum(Scope::class)]];
    }

    /**
     * @return array<string, mixed>
     */
    public static function recurrenceRules(string $key): array
    {
        return [$key => ['nullable', 'array:type,every,weekdays,day,until']];
    }

    /**
     * @return list<mixed>
     */
    public static function colorRule(): array
    {
        return [Rule::enum(TaskColor::class)];
    }
}
