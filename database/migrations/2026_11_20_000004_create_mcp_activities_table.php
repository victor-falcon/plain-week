<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * What AI agents changed through the MCP server (Settings › Agents › Activity). Kept 90 days.
     */
    public function up(): void
    {
        Schema::create('mcp_activities', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('tool', 50);
            // `token` (a personal access token) or `oauth` (an OAuth app), with the token or client id and its name
            // at the time of the call, so the entry still reads right after the token is revoked.
            $table->string('client_type', 10);
            $table->string('client_id', 100);
            $table->string('client_name');
            $table->json('task_ids');
            $table->string('summary', 500);
            $table->timestamp('created_at')->index();
            $table->index(['user_id', 'id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('mcp_activities');
    }
};
