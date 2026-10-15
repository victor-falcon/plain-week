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
        Schema::table('tasks', function (Blueprint $table) {
            // Set only on a series row: `{ type, weekdays | day, until? }`.
            $table->json('recurrence')->nullable();
            // Set only on an exception row. Not a foreign key: the series may arrive in a later push.
            $table->string('series_id', 36)->nullable();
            $table->date('occurrence_date')->nullable();

            $table->index(['user_id', 'series_id']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('tasks', function (Blueprint $table) {
            $table->dropIndex(['user_id', 'series_id']);
            $table->dropColumn(['recurrence', 'series_id', 'occurrence_date']);
        });
    }
};
