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
            // The OpenID Connect identity the account logs in with (config/oidc.php): the IdP's issuer URL and the
            // user's `sub` there. The pair is unique; a `sub` is only unique within its issuer.
            $table->string('oidc_issuer')->nullable();
            $table->string('oidc_sub')->nullable();
            $table->unique(['oidc_issuer', 'oidc_sub']);

            // Accounts created through the IdP have no password until they set one.
            $table->string('password')->nullable()->change();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropUnique(['oidc_issuer', 'oidc_sub']);
            $table->dropColumn(['oidc_issuer', 'oidc_sub']);
        });
    }
};
