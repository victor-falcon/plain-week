<?php

namespace App\Actions\Sync;

use Illuminate\Support\Facades\DB;

/**
 * The global `sync_versions` counter that orders every accepted task write (see "Versioning" in
 * docs/architecture.md). Call it inside the write's transaction.
 */
final class SyncVersions
{
    /**
     * Reserve a block of versions and return the first one.
     *
     * When the counter update is the first statement of the transaction, it takes the write lock up front: the row
     * lock on MySQL/PostgreSQL and the database write lock on SQLite. Concurrent writers therefore commit their
     * versions in order. Unused versions in the block leave gaps, which is fine: versions are only required to
     * increase.
     */
    public static function reserve(int $count): int
    {
        DB::table('sync_versions')->where('id', 1)->increment('value', $count);

        $last = (int) DB::table('sync_versions')->where('id', 1)->value('value');

        return $last - $count + 1;
    }

    /**
     * Take the counter's write lock without reserving anything, for a writer that must read before it knows how many
     * versions it needs: it then reads and writes as if it were alone, like a push does.
     */
    public static function lock(): void
    {
        DB::table('sync_versions')->where('id', 1)->increment('value', 0);
    }
}
