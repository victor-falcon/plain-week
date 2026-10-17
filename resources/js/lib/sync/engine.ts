import { onLocalChange } from '@/lib/db/changes';
import {
    allTables,
    clearAllTables,
    wipeLocalDatabase,
} from '@/lib/db/database';
import type { PlainWeekDatabase } from '@/lib/db/database';
import { compareTimestamps } from '@/lib/db/dates';
import { purgeDemoTasks } from '@/lib/db/demo';
import type { OutboxEntry, Task } from '@/lib/db/types';
import { withSyncLock } from './lock';
import {
    hasStatus,
    isNetworkFailure,
    isPermanentFailure,
    isTransientFailure,
    retryAfterOf,
    retryDelay,
} from './retry';
import { REQUEST_TIMEOUT_MS, SYNC_FORMAT, SyncTimeoutError } from './transport';
import type { SyncTransport } from './transport';

export type SyncStatus = 'idle' | 'syncing' | 'offline' | 'error';

/** The browser APIs the engine relies on, injectable for tests. */
export type SyncEnvironment = {
    isOnline(): boolean;
    /** Whether the page is shown; the periodic sync only runs then. */
    isVisible(): boolean;
    addEventListener(type: string, listener: () => void): void;
    removeEventListener(type: string, listener: () => void): void;
};

export type SyncEngineOptions = {
    db: PlainWeekDatabase;
    transport: SyncTransport;
    environment?: SyncEnvironment;
    /**
     * Max records per push request (the server accepts up to 500). Halved
     * after each timeout, so a slow uplink still gets through; restored by a
     * successful run.
     */
    pushBatchSize?: number;
    /** `limit` of each pull request (the server accepts up to 1000); halved like the push batch. */
    pullLimit?: number;
    /** Delay between a local mutation and the sync it triggers. */
    debounceMs?: number;
    /** Background sync interval (only while the page is visible). */
    intervalMs?: number;
    /** First retry delay after a failure; doubles up to 5 min, with jitter. */
    retryBaseMs?: number;
    /** A request without an answer after this long is aborted and retried. */
    requestTimeoutMs?: number;
    /** How long to wait for another tab's run before trying again later. */
    lockTimeoutMs?: number;
    /** Transient failures only turn the status to `error` after this long. */
    errorAfterMs?: number;
    /** Source of the retry jitter, in [0, 1). */
    random?: () => number;
    /**
     * Called after the engine found the server session gone, wiped the local
     * database and stopped.
     */
    onSessionExpired?: () => void;
    /**
     * Asked before that wipe when some local changes never reached the
     * server. Return false to keep everything (sync stops and resumes when
     * the same user signs in again).
     */
    confirmDiscard?: (pendingChanges: number) => boolean;
    /**
     * Called after the server answered `402 Payment Required` (SaaS mode, the
     * account has no paid plan) and the engine stopped. Local data is kept.
     */
    onPaymentRequired?: () => void;
};

function isPending(entry: OutboxEntry): boolean {
    return entry.failed_revision !== entry.revision;
}

/** Where a browser event fires: `visibilitychange` on the document. */
function eventTarget(type: string): EventTarget | null {
    if (type !== 'visibilitychange') {
        return window;
    }

    return typeof document === 'undefined' ? null : document;
}

const browserEnvironment: SyncEnvironment = {
    isOnline: () => navigator.onLine,
    isVisible: () =>
        typeof document === 'undefined' ||
        document.visibilityState !== 'hidden',
    addEventListener: (type, listener) =>
        eventTarget(type)?.addEventListener(type, listener),
    removeEventListener: (type, listener) =>
        eventTarget(type)?.removeEventListener(type, listener),
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
 * Binds the local database to `userId` in one transaction over every table:
 * data of a different user is wiped, data without an owner (guest work) is
 * kept, except untouched demo tasks, which are deleted (they never reach the
 * server). `check` runs first inside the transaction and may throw to cancel.
 */
export function claimDatabaseFor(
    db: PlainWeekDatabase,
    userId: string,
    check: () => void = () => {},
): Promise<void> {
    return db.transaction('rw', allTables(db), async () => {
        check();

        const owner = await db.meta.get('user_id');

        if (owner && String(owner.value) !== userId) {
            await clearAllTables(db);
        }

        await purgeDemoTasks(db);
        await db.meta.put({ key: 'user_id', value: userId });
    });
}

/**
 * Background sync: pushes the outbox, then pulls remote changes, applying them
 * with last-write-wins. It never blocks the UI; the UI keeps reading Dexie.
 * Failures are retried on their own (exponential backoff with jitter, and at
 * once when the device comes back online or the page is shown again). See
 * docs/architecture.md for the full lifecycle.
 */
export class SyncEngine {
    private readonly db: PlainWeekDatabase;
    /** The injected transport, every call bounded by the request timeout. */
    private readonly transport: SyncTransport;
    private readonly environment: SyncEnvironment;
    private readonly pushBatchSize: number;
    private readonly pullLimit: number;
    private readonly debounceMs: number;
    private readonly intervalMs: number;
    private readonly retryBaseMs: number;
    private readonly requestTimeoutMs: number;
    private readonly lockTimeoutMs: number;
    private readonly errorAfterMs: number;
    private readonly random: () => number;
    private readonly onSessionExpired: () => void;
    private readonly confirmDiscard: (pendingChanges: number) => boolean;
    private readonly onPaymentRequired: () => void;

    private userId: string | null = null;
    /** Bumped on start/stop so in-flight runs can tell they are stale. */
    private generation = 0;
    private running: Promise<void> | null = null;
    private rerunRequested = false;
    private status: SyncStatus = 'idle';
    private readonly statusListeners = new Set<() => void>();
    private debounceTimer: ReturnType<typeof setTimeout> | null = null;
    private teardown: Array<() => void> = [];
    /** Consecutive failed runs; drives the backoff. */
    private failures = 0;
    /** When the server started failing (network failures do not count). */
    private failingSince: number | null = null;
    private retryAt = 0;
    /** The server's `Retry-After`: not even focus or `online` retry sooner. */
    private notBefore = 0;
    /** Batch sizes are scaled by this; halved after each timeout. */
    private batchScale = 1;
    private retryTimer: ReturnType<typeof setTimeout> | null = null;
    /** Cancels the request in flight, if any. */
    private cancelRequest: (() => void) | null = null;

    constructor(options: SyncEngineOptions) {
        const transport = options.transport;

        this.db = options.db;
        this.transport = {
            push: (tasks) =>
                this.request((signal) => transport.push(tasks, signal)),
            pull: (cursor, limit) =>
                this.request((signal) => transport.pull(cursor, limit, signal)),
        };
        this.environment = options.environment ?? browserEnvironment;
        this.pushBatchSize = options.pushBatchSize ?? 500;
        this.pullLimit = options.pullLimit ?? 500;
        this.debounceMs = options.debounceMs ?? 1000;
        this.intervalMs = options.intervalMs ?? 30_000;
        this.retryBaseMs = options.retryBaseMs ?? 2000;
        this.requestTimeoutMs = options.requestTimeoutMs ?? REQUEST_TIMEOUT_MS;
        this.lockTimeoutMs = options.lockTimeoutMs ?? 60_000;
        this.errorAfterMs = options.errorAfterMs ?? 2 * 60_000;
        this.random = options.random ?? Math.random;
        this.onSessionExpired = options.onSessionExpired ?? (() => {});
        this.confirmDiscard = options.confirmDiscard ?? (() => true);
        this.onPaymentRequired = options.onPaymentRequired ?? (() => {});
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

        const { environment } = this;
        const syncNow = () => void this.syncNow();
        const goOffline = () => this.setStatus('offline');
        const onVisibilityChange = () => {
            if (environment.isVisible()) {
                syncNow();
            }
        };
        const unsubscribe = onLocalChange(() => this.scheduleSync());
        // The periodic pull only matters while someone looks at the page.
        const interval = setInterval(() => {
            if (environment.isVisible()) {
                void this.sync();
            }
        }, this.intervalMs);
        const listeners: Array<[string, () => void]> = [
            ['online', syncNow],
            ['offline', goOffline],
            ['focus', syncNow],
            ['visibilitychange', onVisibilityChange],
        ];

        listeners.forEach(([type, listener]) =>
            environment.addEventListener(type, listener),
        );

        this.teardown = [
            unsubscribe,
            () => clearInterval(interval),
            ...listeners.map(
                ([type, listener]) =>
                    () =>
                        environment.removeEventListener(type, listener),
            ),
        ];

        void this.sync();
    }

    /**
     * Stops syncing; an in-flight request is aborted and the run finishes
     * without writing anything.
     */
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
        this.cancelRequest?.();
        this.resetBackoff();
        this.batchScale = 1;
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
     * outbox has been pushed and remote changes pulled, or the run failed.
     * Never rejects. While backing off after a failure it does nothing (the
     * retry timer runs it) unless `force` is set, which also resets the
     * backoff (the manual "Retry sync").
     */
    sync({ force = false }: { force?: boolean } = {}): Promise<void> {
        if (this.userId === null) {
            return Promise.resolve();
        }

        if (force) {
            this.resetBackoff();
        }

        if (!this.environment.isOnline()) {
            this.setStatus('offline');

            return Promise.resolve();
        }

        if (this.running) {
            this.rerunRequested = true;

            return this.running;
        }

        if (Date.now() < this.retryAt) {
            return Promise.resolve();
        }

        this.running = (async () => {
            do {
                this.rerunRequested = false;
                await this.runLocked(this.generation);
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

    /**
     * A sign the connection may be back (`online`, focus, the page shown
     * again): try at once instead of waiting for the retry timer, unless the
     * server asked to wait (`Retry-After`). The failure streak is kept, so the
     * backoff keeps growing if it fails again.
     */
    private syncNow(): Promise<void> {
        if (Date.now() < this.notBefore) {
            return Promise.resolve();
        }

        this.clearRetryTimer();
        this.retryAt = 0;

        return this.sync();
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

    /**
     * Runs `call` with a signal that aborts it after the request timeout or on
     * `stop()`. The returned promise settles then even if the transport
     * ignores the signal, so a dead connection never holds a run, nor the
     * cross-tab lock, forever.
     */
    private request<T>(call: (signal: AbortSignal) => Promise<T>): Promise<T> {
        const controller = new AbortController();

        return new Promise<T>((resolve, reject) => {
            const abort = (reason: Error) => {
                reject(reason);
                controller.abort();
            };
            const timer = setTimeout(
                () => abort(new SyncTimeoutError(this.requestTimeoutMs)),
                this.requestTimeoutMs,
            );
            const cancel = () => abort(new SyncCancelled());

            this.cancelRequest = cancel;
            call(controller.signal)
                .then(resolve, reject)
                .finally(() => {
                    clearTimeout(timer);

                    if (this.cancelRequest === cancel) {
                        this.cancelRequest = null;
                    }
                });
        });
    }

    /** One run under the cross-tab lock. Never rejects. */
    private async runLocked(generation: number): Promise<void> {
        try {
            await withSyncLock(() => this.run(generation), {
                timeoutMs: this.lockTimeoutMs,
            });
        } catch (error) {
            // The lock was not granted in time, or the failure handling
            // itself failed (e.g. IndexedDB): retry like any failed run.
            this.recordFailure(error, generation);
        }
    }

    private async run(generation: number): Promise<void> {
        this.setStatus('syncing');

        try {
            await this.claimDatabase(generation);
            await this.push(generation);
            await this.pull(generation);
            this.resetBackoff();
            this.batchScale = 1;
            await this.settleStatus();
        } catch (error) {
            await this.handleFailure(error, generation);
        }
    }

    private async handleFailure(
        error: unknown,
        generation: number,
    ): Promise<void> {
        if (error instanceof SyncCancelled) {
            return;
        }

        const failure = hasStatus(error, 419)
            ? await this.confirmSession(error)
            : error;

        if (generation !== this.generation) {
            return;
        }

        if (hasStatus(failure, 402)) {
            // No paid plan: retrying cannot help. Stop without a retry
            // loop; the outbox keeps the changes for after the payment.
            this.stop();
            this.onPaymentRequired();

            return;
        }

        if (hasStatus(failure, 401)) {
            await this.forgetUser(generation);

            return;
        }

        this.recordFailure(failure, generation);
    }

    /**
     * A 419 on push usually means the XSRF token of an ended session. A pull
     * (no token needed) tells: its `401` (session gone) or `402` (no plan)
     * replaces the 419; when it succeeds the session is alive and its
     * response refreshed the token, so the 419 is retried like any transient
     * failure.
     */
    private async confirmSession(error: unknown): Promise<unknown> {
        try {
            await this.transport.pull(0, 1);

            return error;
        } catch (pullError) {
            return hasStatus(pullError, 401) || hasStatus(pullError, 402)
                ? pullError
                : error;
        }
    }

    /**
     * Schedules the retry and reports the failure. Network failures read as
     * `offline`. Other transient ones read as `syncing` (it is still trying)
     * until the server has been failing for `errorAfterMs`; anything else is
     * an `error` at once. Every failure is retried, so a cause that goes away
     * (a deploy, a server bug fixed) heals by itself.
     */
    private recordFailure(error: unknown, generation: number): void {
        if (generation !== this.generation || this.userId === null) {
            return;
        }

        const now = Date.now();
        const retryAfter = retryAfterOf(error);
        const delay = retryDelay(
            ++this.failures,
            this.retryBaseMs,
            this.random(),
            retryAfter,
        );

        this.retryAt = now + delay;
        this.notBefore = retryAfter > 0 ? this.retryAt : 0;
        this.clearRetryTimer();
        this.retryTimer = setTimeout(() => {
            this.retryTimer = null;
            // Due now, even if the clock moved back meanwhile.
            this.retryAt = 0;
            void this.sync();
        }, delay);

        if (error instanceof SyncTimeoutError) {
            this.batchScale = Math.max(this.batchScale / 2, 1 / 64);
        }

        if (!this.environment.isOnline() || isNetworkFailure(error)) {
            // Time offline does not count towards `error`.
            this.failingSince = null;
            this.setStatus('offline');

            return;
        }

        this.failingSince ??= now;
        this.setStatus(
            isTransientFailure(error) &&
                now - this.failingSince < this.errorAfterMs
                ? 'syncing'
                : 'error',
        );
    }

    private resetBackoff(): void {
        this.failures = 0;
        this.failingSince = null;
        this.retryAt = 0;
        this.notBefore = 0;
        this.clearRetryTimer();
    }

    private scaled(size: number): number {
        return Math.max(1, Math.floor(size * this.batchScale));
    }

    private clearRetryTimer(): void {
        if (this.retryTimer !== null) {
            clearTimeout(this.retryTimer);
            this.retryTimer = null;
        }
    }

    /**
     * The user is no longer signed in on this device: their data must not
     * stay behind (shared devices) nor be pushed by anyone later, so the
     * database is wiped, after asking about unsynced changes (like logout).
     * Runs under the sync lock.
     */
    private async forgetUser(generation: number): Promise<void> {
        if (generation !== this.generation) {
            return;
        }

        const pending = await this.pendingCount();

        if (pending > 0 && !this.confirmDiscard(pending)) {
            this.stop();

            return;
        }

        await wipeLocalDatabase(this.db);
        this.stop();
        this.onSessionExpired();
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

        await claimDatabaseFor(db, this.userId as string, () =>
            this.assertCurrent(generation),
        );
    }

    private async push(generation: number): Promise<void> {
        const { db } = this;
        const attempted = new Set<string>();

        for (;;) {
            this.assertCurrent(generation);

            const entries = (await db.outbox.toArray())
                .filter((entry) => isPending(entry))
                .filter((entry) => !attempted.has(entry.task_id))
                .slice(0, this.scaled(this.pushBatchSize));

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
        let cursor = await this.storedCursor();

        for (;;) {
            this.assertCurrent(generation);

            const page = await this.transport.pull(
                cursor,
                this.scaled(this.pullLimit),
            );
            const next = Number(page.cursor);

            await db.transaction('rw', allTables(db), async () => {
                this.assertCurrent(generation);
                await this.applyRemote(page.tasks.map(toTask));
                await db.meta.bulkPut([
                    { key: 'cursor', value: next },
                    { key: 'cursor_format', value: SYNC_FORMAT },
                ]);
            });

            if (!page.has_more || next <= cursor) {
                return;
            }

            cursor = next;
        }
    }

    /**
     * Where the next pull starts. A cursor stored by an older format starts
     * over once: the server held back rows that format could not read (a
     * v0.0.3 client never got daily series), and they are below that cursor.
     */
    private async storedCursor(): Promise<number> {
        const [cursor, format] = await this.db.meta.bulkGet([
            'cursor',
            'cursor_format',
        ]);

        return format?.value === SYNC_FORMAT ? Number(cursor?.value ?? 0) : 0;
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
