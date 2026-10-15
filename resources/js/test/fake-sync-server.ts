import { compareTimestamps } from '@/lib/db/dates';
import type { Task } from '@/lib/db/types';

type StoredTask = Task & { version: number };

/**
 * An in-memory implementation of the sync contract (POST /sync/push,
 * GET /sync/pull), exposed as a `fetch` replacement.
 */
export function createFakeSyncServer() {
    const rows = new Map<string, StoredTask>();
    let version = 0;
    const server = {
        rows,
        requests: [] as Array<{ url: string; init?: RequestInit }>,
        /** Status to answer every request with instead of handling it. */
        failWith: null as number | null,
        /** Awaited before answering a push (to simulate a slow network). */
        beforePushResponse: null as (() => Promise<void>) | null,
        /** Stores a record as if another device had pushed it. */
        seed(task: Task) {
            rows.set(task.id, { ...task, version: ++version });
        },
        fetch: async (input: string, init?: RequestInit) => {
            const url = input;

            server.requests.push({ url, init });

            if (server.failWith !== null) {
                return new Response('{}', { status: server.failWith });
            }

            if (url.startsWith('/sync/push')) {
                const { tasks } = JSON.parse(init?.body as string) as {
                    tasks: Task[];
                };
                const applied: string[] = [];

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
                const newer = [...rows.values()]
                    .filter((row) => row.version > cursor)
                    .sort((a, b) => a.version - b.version);
                const page = newer.slice(0, limit);

                return Response.json({
                    tasks: page,
                    cursor: page.at(-1)?.version ?? cursor,
                    has_more: newer.length > page.length,
                });
            }

            return new Response('Not found', { status: 404 });
        },
    };

    return server;
}
