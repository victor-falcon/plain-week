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
        // A user's ICS subscription feed (docs/architecture.md, "ICS feed"): at most one, off until enabled.
        Schema::create('ics_feeds', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->unique()->constrained()->cascadeOnDelete();
            // SHA-256 of the secret token in the feed URL, for the lookup.
            $table->char('token_hash', 64)->unique();
            // The token itself, encrypted with APP_KEY, so Settings › Integrations can show the URL again.
            $table->text('token');
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('ics_feeds');
    }
};
