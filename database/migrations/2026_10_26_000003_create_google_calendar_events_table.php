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
        Schema::create('google_calendar_events', function (Blueprint $table) {
            $table->id();
            $table->foreignId('google_calendar_connection_id')->constrained()->cascadeOnDelete();
            // The task id of a plain task, or `${series_id}:${occurrence_date}` for an occurrence of a series.
            $table->string('key');
            $table->string('google_event_id');
            // The date the event is on, so events that fall behind the sync window can be left alone.
            $table->date('date');
            // Hash of the event last sent; null until Google confirmed it.
            $table->string('payload_hash', 64)->nullable();
            $table->timestamps();

            $table->unique(['google_calendar_connection_id', 'key']);
        });

        Schema::table('google_calendar_connections', function (Blueprint $table) {
            $table->dateTime('last_synced_at')->nullable()->after('connected_at');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('google_calendar_connections', function (Blueprint $table) {
            $table->dropColumn('last_synced_at');
        });

        Schema::dropIfExists('google_calendar_events');
    }
};
