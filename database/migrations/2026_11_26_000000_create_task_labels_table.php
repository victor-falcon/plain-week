<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        // The name a user gave a task color (see "Data model: TaskLabel" in docs/architecture.md). Synced like tasks.
        Schema::create('task_labels', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('color', 16);
            // At most 24 characters (validated); the column leaves room for databases that count bytes.
            $table->string('name', 64);
            // Client-owned timestamp (UTC, millisecond precision).
            $table->dateTime('updated_at', 3);
            $table->unsignedBigInteger('version');

            $table->unique(['user_id', 'color']);
            $table->index(['user_id', 'version']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('task_labels');
    }
};
