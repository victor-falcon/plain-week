import type { Task } from '@/lib/db/types';

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

async function request<T>(url: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    const token = xsrfToken();

    headers.set('Accept', 'application/json');
    headers.set('X-Requested-With', 'XMLHttpRequest');

    if (token) {
        headers.set('X-XSRF-TOKEN', token);
    }

    const response = await fetch(url, {
        ...init,
        headers,
        credentials: 'same-origin',
    });

    if (!response.ok) {
        throw new SyncHttpError(response.status);
    }

    return (await response.json()) as T;
}

/**
 * Talks to `POST /sync/push` and `GET /sync/pull` with the session cookie and
 * Laravel's XSRF-TOKEN cookie.
 */
export const fetchTransport: SyncTransport = {
    push: (tasks) =>
        request<PushResponse>('/sync/push', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tasks }),
        }),
    pull: (cursor, limit) =>
        request<PullResponse>(
            `/sync/pull?${new URLSearchParams({
                cursor: String(cursor),
                limit: String(limit),
            })}`,
        ),
};
