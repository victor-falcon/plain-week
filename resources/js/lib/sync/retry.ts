import { SyncLockTimeout } from './lock';
import { SyncHttpError, SyncNetworkError, SyncTimeoutError } from './transport';

/** The longest the engine waits between two attempts. */
export const MAX_RETRY_MS = 5 * 60_000;

export function hasStatus(error: unknown, status: number): boolean {
    return error instanceof SyncHttpError && error.status === status;
}

/** The server refused the payload itself: retrying it unchanged cannot work. */
export function isPermanentFailure(error: unknown): boolean {
    return hasStatus(error, 422) || hasStatus(error, 413);
}

/**
 * No answer from the server (the network failed, or a timeout): the device is
 * effectively offline, whatever `navigator.onLine` says.
 */
export function isNetworkFailure(error: unknown): boolean {
    return (
        error instanceof SyncNetworkError || error instanceof SyncTimeoutError
    );
}

/**
 * A failure the same request may well get past soon: the network, a busy or
 * restarting server, rate limiting, a stale XSRF token (a 419 only gets here
 * once a pull showed the session is alive, and that pull refreshed the
 * token), or another tab holding the lock.
 */
export function isTransientFailure(error: unknown): boolean {
    if (isNetworkFailure(error) || error instanceof SyncLockTimeout) {
        return true;
    }

    return (
        error instanceof SyncHttpError &&
        (error.status >= 500 || [408, 419, 429].includes(error.status))
    );
}

/** How long the server asked to wait (`Retry-After`), 0 when it did not. */
export function retryAfterOf(error: unknown): number {
    return error instanceof SyncHttpError ? (error.retryAfterMs ?? 0) : 0;
}

/**
 * The delay before the next attempt after `failures` failures in a row:
 * `baseMs` doubling up to `MAX_RETRY_MS`, with "equal jitter" (half fixed,
 * half random, so tabs and devices that failed together do not retry in
 * lockstep), never shorter than the server's `Retry-After` (capped too).
 */
export function retryDelay(
    failures: number,
    baseMs: number,
    random: number,
    retryAfterMs: number,
): number {
    const backoff = Math.min(baseMs * 2 ** (failures - 1), MAX_RETRY_MS);
    const jittered = backoff / 2 + (random * backoff) / 2;

    return Math.min(Math.max(jittered, retryAfterMs), MAX_RETRY_MS);
}
