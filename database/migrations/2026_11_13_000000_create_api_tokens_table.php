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
        Schema::create('api_tokens', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            // The device name the token was issued for ("Pixel 9"), for the user to see.
            $table->string('name', 100);
            // SHA-256 of the plain token; the plain token is only ever returned once, at issue.
            $table->string('token_hash', 64)->unique();
            $table->timestamp('last_used_at')->nullable();
            // Null means the token does not expire (v1); revoking deletes the row.
            $table->timestamp('expires_at')->nullable();
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('api_tokens');
    }
};
