<?php

namespace Database\Factories;

use App\Models\McpActivity;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/**
 * @extends Factory<McpActivity>
 */
class McpActivityFactory extends Factory
{
    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'user_id' => User::factory(),
            'tool' => 'create_tasks',
            'client_type' => 'token',
            'client_id' => Str::random(40),
            'client_name' => 'Claude Code',
            'task_ids' => [(string) Str::uuid7()],
            'summary' => 'Created “Buy milk” on Mon 23 Nov',
        ];
    }
}
