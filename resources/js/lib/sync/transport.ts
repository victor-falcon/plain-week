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

/**
 * The two sync endpoints, abstracted so the engine can be tested. `signal`
 * cancels the request (the engine's timeout or `stop()`).
 */
export type SyncTransport = {
    push(tasks: Task[], signal?: AbortSignal): Promise<PushResponse>;
    pull(
        cursor: number,
        limit: number,
        signal?: AbortSignal,
    ): Promise<PullResponse>;
};

/**
 * What this client understands, sent as `X-Sync-Format` on push and pull:
 * 2 adds daily ("every N days") rules. The server never sends a daily series
 * to a client without the header (v0.0.3 and older).
 */
export const SYNC_FORMAT = 2;

const SYNC_HEADERS = { 'X-Sync-Format': String(SYNC_FORMAT) };

export class SyncHttpError extends Error {
    constructor(
        readonly status: number,
        /** How long the server asked to wait (`Retry-After`), if it did. */
        readonly retryAfterMs: number | null = null,
    ) {
        super(`Sync request failed with HTTP ${status}.`);
        this.name = 'SyncHttpError';
    }
}

/** The request never reached the server, or its answer never came back. */
export class SyncNetworkError extends Error {
    constructor(cause: unknown) {
        super('Sync request failed: the network is unreachable.', { cause });
        this.name = 'SyncNetworkError';
    }
}

/** A sync request got no answer in time (a dead or very slow connection). */
export class SyncTimeoutError extends Error {
    constructor(timeoutMs: number) {
        super(`Sync request got no answer within ${timeoutMs} ms.`);
        this.name = 'SyncTimeoutError';
    }
}

/** `Retry-After` in delay-seconds or HTTP-date form, as milliseconds. */
export function parseRetryAfter(value: string | null): number | null {
    if (value === null || value.trim() === '') {
        return null;
    }

    const seconds = Number(value);

    if (Number.isFinite(seconds)) {
        return Math.max(0, seconds * 1000);
    }

    const date = Date.parse(value);

    return Number.isNaN(date) ? null : Math.max(0, date - Date.now());
}

function xsrfToken(): string | null {
    if (typeof document === 'undefined') {
        return null;
    }

    const match = document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]*)/);

    return match ? decodeURIComponent(match[1]) : null;
}

/**
 * How long a request may go unanswered. The engine enforces it itself (see
 * `SyncEngine`); `send` applies it to requests without a caller's signal
 * (logout, session checks).
 */
export const REQUEST_TIMEOUT_MS = 20_000;

/**
 * Same-origin fetch with the session cookie and the XSRF header. Without a
 * `signal` in `init` it times out after `REQUEST_TIMEOUT_MS`.
 */
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

    let response: Response;

    try {
        response = await fetch(url, {
            ...init,
            headers,
            credentials: 'same-origin',
            signal: init.signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
    } catch (error) {
        // The caller aborted it (timeout, stop): theirs to report.
        if (init.signal?.aborted) {
            throw error;
        }

        throw new SyncNetworkError(error);
    }

    if (!response.ok) {
        throw new SyncHttpError(
            response.status,
            parseRetryAfter(response.headers.get('Retry-After')),
        );
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
 * Asks the server whether the session is gone, with the smallest pull (it
 * needs no XSRF token). Only a `401` says so; any other failure (offline,
 * server errors) is unknown and resolves false, so nothing gets wiped.
 */
export async function isSessionGone(
    transport: SyncTransport,
): Promise<boolean> {
    try {
        await transport.pull(0, 1);

        return false;
    } catch (error) {
        return error instanceof SyncHttpError && error.status === 401;
    }
}

/**
 * Talks to `POST /sync/push` and `GET /sync/pull` with the session cookie and
 * Laravel's XSRF-TOKEN cookie.
 */
export const fetchTransport: SyncTransport = {
    push: (tasks, signal) =>
        request<PushResponse>(push.url(), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...SYNC_HEADERS },
            body: JSON.stringify({ tasks }),
            signal,
        }),
    pull: (cursor, limit, signal) =>
        request<PullResponse>(pull.url({ query: { cursor, limit } }), {
            headers: SYNC_HEADERS,
            signal,
        }),
};
