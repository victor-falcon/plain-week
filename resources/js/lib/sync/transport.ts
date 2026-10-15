import type { Task } from '@/lib/db/types';
import { pull, push } from '@/routes/sync';

export type PushResponse = {
    applied: string[];
    rejected: string[];
    cursor: number;
};

export type PullResponse = {
    tasks: Task[];
    cursor: number;
    has_more: boolean;
};

/** The two sync endpoints, abstracted so the engine can be tested. */
export type SyncTransport = {
    push(tasks: Task[]): Promise<PushResponse>;
    pull(cursor: number, limit: number): Promise<PullResponse>;
};

/**
 * What this client understands, sent as `X-Sync-Format` on push and pull:
 * 2 adds daily ("every N days") rules. The server never sends a daily series
 * to a client without the header (v0.0.3 and older).
 */
export const SYNC_FORMAT = 2;

const SYNC_HEADERS = { 'X-Sync-Format': String(SYNC_FORMAT) };

export class SyncHttpError extends Error {
    constructor(readonly status: number) {
        super(`Sync request failed with HTTP ${status}.`);
        this.name = 'SyncHttpError';
    }
}

function xsrfToken(): string | null {
    if (typeof document === 'undefined') {
        return null;
    }

    const match = document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]*)/);

    return match ? decodeURIComponent(match[1]) : null;
}

const REQUEST_TIMEOUT_MS = 30_000;

/** Same-origin fetch with the session cookie and the XSRF header. */
async function send(url: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers);
    const token = xsrfToken();

    if (!headers.has('Accept')) {
        headers.set('Accept', 'application/json');
    }

    headers.set('X-Requested-With', 'XMLHttpRequest');

    if (token) {
        headers.set('X-XSRF-TOKEN', token);
    }

    const response = await fetch(url, {
        ...init,
        headers,
        credentials: 'same-origin',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) {
        throw new SyncHttpError(response.status);
    }

    return response;
}

async function request<T>(url: string, init: RequestInit = {}): Promise<T> {
    const response = await send(url, init);

    return (await response.json()) as T;
}

/**
 * Ends the server session. Resolves with the URL the server redirected to,
 * and throws (`SyncHttpError` or a network error) if logout did not happen.
 */
export async function requestLogout(url: string): Promise<string> {
    const response = await send(url, {
        method: 'POST',
        headers: { Accept: 'text/html' },
    });

    return response.url || '/';
}

/**
 * Talks to `POST /sync/push` and `GET /sync/pull` with the session cookie and
 * Laravel's XSRF-TOKEN cookie.
 */
export const fetchTransport: SyncTransport = {
    push: (tasks) =>
        request<PushResponse>(push.url(), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...SYNC_HEADERS },
            body: JSON.stringify({ tasks }),
        }),
    pull: (cursor, limit) =>
        request<PullResponse>(pull.url({ query: { cursor, limit } }), {
            headers: SYNC_HEADERS,
        }),
};
