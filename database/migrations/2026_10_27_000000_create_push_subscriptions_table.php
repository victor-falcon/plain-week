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
        Schema::create('push_subscriptions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            // Push service URLs can be long, so the unique index is on their SHA-256.
            $table->text('endpoint');
            $table->char('endpoint_hash', 64)->unique();
            $table->string('p256dh');
            $table->string('auth');
            $table->string('content_encoding', 16)->default('aes128gcm');
            $table->text('user_agent')->nullable();
            // The last push the push service accepted.
            $table->dateTime('last_used_at')->nullable();
            $table->timestamps();
        });

        Schema::table('users', function (Blueprint $table) {
            // Local time ('HH:mm', in `timezone`) of the morning notifications.
            $table->string('notification_morning_time', 5)->default('08:00');
        });

        // One row per notification handed to the push services, so a minute that runs twice never sends twice.
        Schema::create('sent_notifications', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            // `seriesId:occurrenceDate` for an occurrence of a series (stable across edits and moves), else the task id.
            $table->string('occurrence_key');
            // `morning` or `reminder`.
            $table->string('kind', 16);
            // The local date it was for ('YYYY-MM-DD').
            $table->date('date');
            $table->dateTime('created_at')->index();

            $table->unique(['user_id', 'occurrence_key', 'kind', 'date']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('sent_notifications');

        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('notification_morning_time');
        });

        Schema::dropIfExists('push_subscriptions');
    }
};
