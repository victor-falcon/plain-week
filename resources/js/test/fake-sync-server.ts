import { compareTimestamps } from '@/lib/db/dates';
import type { Task, TaskLabel } from '@/lib/db/types';

type StoredTask = Task & { version: number };

type StoredLabel = TaskLabel & { version: number };

/**
 * An in-memory implementation of the sync contract (POST /sync/push,
 * GET /sync/pull), exposed as a `fetch` replacement. Labels are kept per
 * colour and share the version sequence with tasks.
 */
export function createFakeSyncServer() {
    const rows = new Map<string, StoredTask>();
    const labels = new Map<string, StoredLabel>();
    let version = 0;
    const server = {
        rows,
        labels,
        requests: [] as Array<{ url: string; init?: RequestInit }>,
        /** Status to answer every request with instead of handling it. */
        failWith: null as number | null,
        /** Status to answer pushes only with (e.g. 419 for a lost session). */
        failPushWith: null as number | null,
        /** Push batches containing a matching task are refused with 422. */
        isInvalid: (() => false) as (task: Task) => boolean,
        /** Awaited before answering a push (to simulate a slow network). */
        beforePushResponse: null as (() => Promise<void>) | null,
        /** Stores a record as if another device had pushed it. */
        seed(task: Task) {
            rows.set(task.id, { ...task, version: ++version });
        },
        /** Stores a label as if another device had pushed it. */
        seedLabel(label: TaskLabel) {
            labels.set(label.color, { ...label, version: ++version });
        },
        fetch: async (input: string, init?: RequestInit) => {
            const url = input;

            server.requests.push({ url, init });

            if (server.failWith !== null) {
                return new Response('{}', { status: server.failWith });
            }

            if (url.startsWith('/sync/push') && server.failPushWith !== null) {
                return new Response('{}', { status: server.failPushWith });
            }

            if (url.startsWith('/sync/push')) {
                const { tasks, labels: pushedLabels = [] } = JSON.parse(
                    init?.body as string,
                ) as {
                    tasks: Task[];
                    labels?: TaskLabel[];
                };
                const applied: string[] = [];

                if (tasks.some((task) => server.isInvalid(task))) {
                    return Response.json(
                        { message: 'Invalid.', errors: {} },
                        { status: 422 },
                    );
                }

                tasks.forEach((task) => {
                    const stored = rows.get(task.id);

                    if (
                        !stored ||
                        compareTimestamps(task.updated_at, stored.updated_at) >=
                            0
                    ) {
                        server.seed(task);
                        applied.push(task.id);
                    }
                });

                pushedLabels.forEach((label) => {
                    const stored = labels.get(label.color);

                    if (
                        !stored ||
                        compareTimestamps(
                            label.updated_at,
                            stored.updated_at,
                        ) >= 0
                    ) {
                        server.seedLabel(label);
                    }
                });

                await server.beforePushResponse?.();

                return Response.json({
                    applied,
                    rejected: [],
                    cursor: version,
                });
            }

            if (url.startsWith('/sync/pull')) {
                const params = new URL(url, 'http://localhost').searchParams;
                const cursor = Number(params.get('cursor'));
                const limit = Number(params.get('limit'));
                const newer = [...rows.values(), ...labels.values()]
                    .filter((row) => row.version > cursor)
                    .sort((a, b) => a.version - b.version);
                const page = newer.slice(0, limit);
                const strip = (row: StoredLabel): TaskLabel => ({
                    color: row.color,
                    name: row.name,
                    updated_at: row.updated_at,
                });

                return Response.json({
                    tasks: page.filter((row) => 'id' in row),
                    labels: page
                        .filter((row): row is StoredLabel => !('id' in row))
                        .map(strip),
                    cursor: page.at(-1)?.version ?? cursor,
                    has_more: newer.length > page.length,
                });
            }

            if (url === '/logout') {
                return new Response('<html></html>', { status: 200 });
            }

            return new Response('Not found', { status: 404 });
        },
    };

    return server;
}
