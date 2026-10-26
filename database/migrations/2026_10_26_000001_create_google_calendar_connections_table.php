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
        Schema::create('google_calendar_connections', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->unique()->constrained()->cascadeOnDelete();
            $table->string('google_email');
            // Encrypted with APP_KEY (`encrypted` casts), hence text.
            $table->text('access_token');
            $table->text('refresh_token');
            $table->dateTime('token_expires_at');
            // The "Plain Week" calendar created on connect.
            $table->string('calendar_id')->nullable();
            $table->dateTime('connected_at');
            $table->text('last_error')->nullable();
            // Set when Google stops accepting the tokens: the user has to reconnect.
            $table->string('disconnected_reason')->nullable();
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('google_calendar_connections');
    }
};
