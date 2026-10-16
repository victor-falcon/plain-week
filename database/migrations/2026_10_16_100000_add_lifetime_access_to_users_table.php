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
        Schema::table('users', function (Blueprint $table) {
            $table->timestamp('lifetime_purchased_at')->nullable();
            // The Stripe payment intent that paid for it, so a refund can revoke it. Null for a manual grant.
            $table->string('lifetime_payment_id')->nullable()->index();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropIndex(['lifetime_payment_id']);
            $table->dropColumn(['lifetime_purchased_at', 'lifetime_payment_id']);
        });
    }
};
