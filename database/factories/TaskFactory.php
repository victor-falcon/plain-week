<?php

namespace Database\Factories;

use App\Enums\TaskColor;
use App\Models\Task;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/**
 * @extends Factory<Task>
 */
class TaskFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        $createdAt = now()->utc()->subMinutes(fake()->numberBetween(1, 10_000));

        return [
            'id' => (string) Str::uuid7(),
            'user_id' => User::factory(),
            'text' => fake()->sentence(3),
            'date' => fake()->date(),
            'someday_column' => null,
            'position' => 'a0',
            'done' => false,
            'done_at' => null,
            'color' => TaskColor::None,
            'time' => null,
            'notes' => '',
            'subtasks' => [],
            'created_at' => $createdAt,
            'updated_at' => $createdAt,
            'deleted_at' => null,
            'version' => 0,
        ];
    }

    /**
     * Indicate that the task lives in a Someday column.
     */
    public function someday(int $column = 0): static
    {
        return $this->state(fn () => ['date' => null, 'someday_column' => $column]);
    }

    /**
     * Indicate that the task has been deleted (tombstone).
     */
    public function deleted(): static
    {
        return $this->state(fn (array $attributes) => ['deleted_at' => $attributes['updated_at']]);
    }
}
