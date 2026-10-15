import { onLocalChange } from '@/lib/db/changes';
import { allTables, clearAllTables } from '@/lib/db/database';
import type { PlainWeekDatabase } from '@/lib/db/database';
import { compareTimestamps } from '@/lib/db/dates';
import { purgeDemoTasks } from '@/lib/db/demo';
import type { OutboxEntry, Task } from '@/lib/db/types';
import { withSyncLock } from './lock';
import { SyncHttpError } from './transport';
import type { SyncTransport } from './transport';

export type SyncStatus = 'idle' | 'syncing' | 'offline' | 'error';

/** The browser APIs the engine relies on, injectable for tests. */
export type SyncEnvironment = {
    isOnline(): boolean;
    addEventListener(type: string, listener: () => void): void;
    removeEventListener(type: string, listener: () => void): void;
};

export type SyncEngineOptions = {
    db: PlainWeekDatabase;
    transport: SyncTransport;
    environment?: SyncEnvironment;
    /** Max records per push request (the server accepts up to 500). */
    pushBatchSize?: number;
    /** `limit` of each pull request (the server accepts up to 1000). */
    pullLimit?: number;
    /** Delay between a local mutation and the sync it triggers. */
    debounceMs?: number;
    /** Background sync interval. */
    intervalMs?: number;
    /** First retry delay after a retryable failure; doubles up to 5 min. */
    retryBaseMs?: number;
};

const MAX_RETRY_MS = 5 * 60_000;

/** The server refused the payload itself: retrying it unchanged cannot work. */
function isPermanentFailure(error: unknown): boolean {
    return (
        error instanceof SyncHttpError &&
        (error.status === 422 || error.status === 413)
    );
}

function isPending(entry: OutboxEntry): boolean {
    return entry.failed_revision !== entry.revision;
}

const browserEnvironment: SyncEnvironment = {
    isOnline: () => navigator.onLine,
    addEventListener: (type, listener) =>
        window.addEventListener(type, listener),
    removeEventListener: (type, listener) =>
        window.removeEventListener(type, listener),
};

/** Thrown inside a run when the engine was stopped or switched user. */
class SyncCancelled extends Error {}

/** Keeps only the contract fields of a record coming from the server. */
function toTask(remote: Task): Task {
    return {
        id: remote.id,
        text: remote.text ?? '',
        date: remote.date ?? null,
        someday_column: remote.someday_column ?? null,
        position: remote.position,
        done: Boolean(remote.done),
        done_at: remote.done_at ?? null,
        color: remote.color ?? 'none',
        time: remote.time ?? null,
        notes: remote.notes ?? '',
        subtasks: remote.subtasks ?? [],
        created_at: remote.created_at,
        updated_at: remote.updated_at,
        deleted_at: remote.deleted_at ?? null,
        recurrence: remote.recurrence ?? null,
        series_id: remote.series_id ?? null,
        occurrence_date: remote.occurrence_date ?? null,
    };
}

/**
 * Binds the local database to `userId`: data of a different user is wiped,
 * data without an owner (guest work) is kept, except untouched demo tasks,
 * which are deleted (they never reach the server). Call it inside a read-write
 * transaction over `allTables()`.
 */
export async function claimDatabaseFor(
    db: PlainWeekDatabase,
    userId: string,
): Promise<void> {
    const owner = await db.meta.get('user_id');

    if (owner && String(owner.value) !== userId) {
        await clearAllTables(db);
    }

    await purgeDemoTasks(db);
    await db.meta.put({ key: 'user_id', value: userId });
}

/**
 * Background sync: pushes the outbox, then pulls remote changes, applying them
 * with last-write-wins. It never blocks the UI; the UI keeps reading Dexie.
 * See docs/architecture.md for the full lifecycle.
 */
export class SyncEngine {
    private readonly db: PlainWeekDatabase;
    private readonly transport: SyncTransport;
    private readonly environment: SyncEnvironment;
    private readonly pushBatchSize: number;
    private readonly pullLimit: number;
    private readonly debounceMs: number;
    private readonly intervalMs: number;
    private readonly retryBaseMs: number;

    private userId: string | null = null;
    /** Bumped on start/stop so in-flight runs can tell they are stale. */
    private generation = 0;
    private running: Promise<void> | null = null;
    private rerunRequested = false;
    private status: SyncStatus = 'idle';
    private readonly statusListeners = new Set<() => void>();
    private debounceTimer: ReturnType<typeof setTimeout> | null = null;
    private teardown: Array<() => void> = [];
    private failures = 0;
    private retryAt = 0;

    constructor(options: SyncEngineOptions) {
        this.db = options.db;
        this.transport = options.transport;
        this.environment = options.environment ?? browserEnvironment;
        this.pushBatchSize = options.pushBatchSize ?? 500;
        this.pullLimit = options.pullLimit ?? 500;
        this.debounceMs = options.debounceMs ?? 1000;
        this.intervalMs = options.intervalMs ?? 30_000;
        this.retryBaseMs = options.retryBaseMs ?? 5000;
    }

    /** True between `start()` and `stop()`. */
    get isStarted(): boolean {
        return this.userId !== null;
    }

    getStatus = (): SyncStatus => this.status;

    subscribe = (listener: () => void): (() => void) => {
        this.statusListeners.add(listener);

        return () => {
            this.statusListeners.delete(listener);
        };
    };

    /** Starts syncing for an authenticated user (no-op if already running). */
    start(userId: string | number): void {
        if (this.userId === String(userId)) {
            return;
        }

        this.stop();
        this.userId = String(userId);
        this.generation++;

        const sync = () => void this.sync();
        const goOffline = () => this.setStatus('offline');
        const unsubscribe = onLocalChange(() => this.scheduleSync());
        const interval = setInterval(sync, this.intervalMs);

        this.environment.addEventListener('online', sync);
        this.environment.addEventListener('offline', goOffline);
        this.environment.addEventListener('focus', sync);

        this.teardown = [
            unsubscribe,
            () => clearInterval(interval),
            () => this.environment.removeEventListener('online', sync),
            () => this.environment.removeEventListener('offline', goOffline),
            () => this.environment.removeEventListener('focus', sync),
        ];

        sync();
    }

    /** Stops syncing; an in-flight run finishes without writing anything. */
    stop(): void {
        this.teardown.forEach((dispose) => dispose());
        this.teardown = [];

        if (this.debounceTimer !== null) {
            clearTimeout(this.debounceTimer);
            this.debounceTimer = null;
        }

        this.userId = null;
        this.generation++;
        this.rerunRequested = false;
        this.failures = 0;
        this.retryAt = 0;
        this.setStatus('idle');
    }

    /** Debounced sync, used after local mutations. */
    scheduleSync(): void {
        if (this.userId === null) {
            return;
        }

        if (this.debounceTimer !== null) {
            clearTimeout(this.debounceTimer);
        }

        this.debounceTimer = setTimeout(() => {
            this.debounceTimer = null;
            void this.sync();
        }, this.debounceMs);
    }

    /**
     * Runs a sync now (or right after the current one) and resolves when the
     * outbox has been pushed and remote changes pulled. Never rejects. While
     * backing off after a failure it does nothing unless `force` is set.
     */
    sync({ force = false }: { force?: boolean } = {}): Promise<void> {
        if (this.userId === null) {
            return Promise.resolve();
        }

        if (!this.environment.isOnline()) {
            this.setStatus('offline');

            return Promise.resolve();
        }

        if (this.running) {
            this.rerunRequested = true;

            return this.running;
        }

        if (!force && Date.now() < this.retryAt) {
            return Promise.resolve();
        }

        this.running = (async () => {
            do {
                this.rerunRequested = false;
                await withSyncLock(() => this.run(this.generation));
            } while (
                this.rerunRequested &&
                this.userId !== null &&
                this.environment.isOnline() &&
                this.failures === 0
            );
        })().finally(() => {
            this.running = null;
        });

        return this.running;
    }

    /** Number of local changes not yet accepted by a push (quarantined too). */
    pendingCount(): Promise<number> {
        return this.db.outbox.count();
    }

    private setStatus(status: SyncStatus): void {
        if (this.status === status) {
            return;
        }

        this.status = status;
        this.statusListeners.forEach((listener) => listener());
    }

    private assertCurrent(generation: number): void {
        if (generation !== this.generation) {
            throw new SyncCancelled();
        }
    }

    private async run(generation: number): Promise<void> {
        this.setStatus('syncing');

        try {
            await this.claimDatabase(generation);
            await this.push(generation);
            await this.pull(generation);
            this.failures = 0;
            this.retryAt = 0;
            await this.settleStatus();
        } catch (error) {
            if (error instanceof SyncCancelled) {
                return;
            }

            if (error instanceof SyncHttpError && error.status === 401) {
                // The session is gone: stop quietly, local data stays usable.
                this.stop();

                return;
            }

            this.failures++;
            this.retryAt =
                Date.now() +
                Math.min(
                    this.retryBaseMs * 2 ** (this.failures - 1),
                    MAX_RETRY_MS,
                );
            // A network failure (fetch TypeError) means we are effectively
            // offline even when `navigator.onLine` says otherwise.
            this.setStatus(
                !this.environment.isOnline() || error instanceof TypeError
                    ? 'offline'
                    : 'error',
            );
        }
    }

    /** Final status of a successful run: quarantined records keep `error`. */
    private async settleStatus(): Promise<void> {
        const quarantined = await this.db.outbox
            .filter((entry) => !isPending(entry))
            .count();

        if (!this.environment.isOnline()) {
            this.setStatus('offline');
        } else {
            this.setStatus(quarantined > 0 ? 'error' : 'idle');
        }
    }

    /**
     * Binds the local database to the current user. Data from a different user
     * is wiped; data without an owner (guest work) is kept and pushed, except
     * the demo tasks the guest never touched, which are deleted.
     */
    private async claimDatabase(generation: number): Promise<void> {
        const { db } = this;

        await db.transaction('rw', allTables(db), async () => {
            this.assertCurrent(generation);
            await claimDatabaseFor(db, this.userId as string);
        });
    }

    private async push(generation: number): Promise<void> {
        const { db } = this;
        const attempted = new Set<string>();

        for (;;) {
            this.assertCurrent(generation);

            const entries = (await db.outbox.toArray())
                .filter((entry) => isPending(entry))
                .filter((entry) => !attempted.has(entry.task_id))
                .slice(0, this.pushBatchSize);

            if (entries.length === 0) {
                return;
            }

            entries.forEach((entry) => attempted.add(entry.task_id));
            await this.pushEntries(generation, entries);
        }
    }

    /**
     * Pushes one batch. When the server refuses it as invalid, the batch is
     * split until the offending records are isolated and quarantined, so one
     * bad record never blocks the rest.
     */
    private async pushEntries(
        generation: number,
        entries: OutboxEntry[],
    ): Promise<void> {
        const records = await this.db.tasks.bulkGet(
            entries.map((entry) => entry.task_id),
        );
        const tasks = records.filter(
            (task): task is Task => task !== undefined,
        );

        try {
            if (tasks.length > 0) {
                this.assertCurrent(generation);
                await this.transport.push(tasks);
            }
        } catch (error) {
            if (!isPermanentFailure(error)) {
                throw error;
            }

            if (entries.length === 1) {
                await this.quarantine(generation, entries[0]);

                return;
            }

            const middle = Math.ceil(entries.length / 2);

            await this.pushEntries(generation, entries.slice(0, middle));
            await this.pushEntries(generation, entries.slice(middle));

            return;
        }

        // Whether applied, rejected or ignored as stale by the server, the
        // entry is done, unless the record changed while it was in flight. The
        // push response `cursor` is not a pull position and is ignored.
        await this.clearSent(generation, entries);
    }

    private async quarantine(
        generation: number,
        entry: OutboxEntry,
    ): Promise<void> {
        const { db } = this;

        console.warn(
            `Sync: the server refused task ${entry.task_id} as invalid; it will be retried after its next change.`,
        );

        await db.transaction('rw', db.outbox, async () => {
            this.assertCurrent(generation);

            const current = await db.outbox.get(entry.task_id);

            if (current?.revision === entry.revision) {
                await db.outbox.put({
                    ...current,
                    failed_revision: current.revision,
                });
            }
        });
    }

    private async clearSent(
        generation: number,
        sent: OutboxEntry[],
    ): Promise<void> {
        const { db } = this;

        await db.transaction('rw', db.outbox, async () => {
            this.assertCurrent(generation);

            const current = await db.outbox.bulkGet(
                sent.map((entry) => entry.task_id),
            );
            const unchanged = sent
                .filter((entry, i) => current[i]?.revision === entry.revision)
                .map((entry) => entry.task_id);

            await db.outbox.bulkDelete(unchanged);
        });
    }

    private async pull(generation: number): Promise<void> {
        const { db } = this;
        let cursor = Number((await db.meta.get('cursor'))?.value ?? 0);

        for (;;) {
            this.assertCurrent(generation);

            const page = await this.transport.pull(cursor, this.pullLimit);
            const next = Number(page.cursor);

            await db.transaction('rw', allTables(db), async () => {
                this.assertCurrent(generation);
                await this.applyRemote(page.tasks.map(toTask));
                await db.meta.put({ key: 'cursor', value: next });
            });

            if (!page.has_more || next <= cursor) {
                return;
            }

            cursor = next;
        }
    }

    /**
     * Last-write-wins. A remote record replaces the local one when it is newer,
     * or equally new and the local one has no pending change. A pending local
     * change that is older than the remote one would lose on the server anyway,
     * so it is dropped to keep both sides converged.
     */
    private async applyRemote(remoteTasks: Task[]): Promise<void> {
        const { db } = this;
        const ids = remoteTasks.map((task) => task.id);
        const [locals, pending] = await Promise.all([
            db.tasks.bulkGet(ids),
            db.outbox.bulkGet(ids),
        ]);
        const toPut: Task[] = [];
        const toUnqueue: string[] = [];

        remoteTasks.forEach((remote, i) => {
            const local = locals[i];

            if (!local) {
                toPut.push(remote);

                return;
            }

            const order = compareTimestamps(
                remote.updated_at,
                local.updated_at,
            );

            if (order > 0) {
                toPut.push(remote);

                if (pending[i]) {
                    toUnqueue.push(remote.id);
                }
            } else if (order === 0 && !pending[i]) {
                toPut.push(remote);
            }
        });

        await db.tasks.bulkPut(toPut);
        await db.outbox.bulkDelete(toUnqueue);
    }
}
