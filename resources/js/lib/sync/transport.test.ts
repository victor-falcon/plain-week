import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { SyncHttpError, fetchTransport, parseRetryAfter } from './transport';

afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

describe('parseRetryAfter', () => {
    it('reads delay-seconds and HTTP dates', () => {
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date('2026-10-17T10:00:00Z'));

        expect(parseRetryAfter('30')).toBe(30_000);
        expect(parseRetryAfter('Sat, 17 Oct 2026 10:01:00 GMT')).toBe(60_000);
        expect(parseRetryAfter('Sat, 17 Oct 2026 09:00:00 GMT')).toBe(0);
    });

    it('ignores a missing or unreadable header', () => {
        expect(parseRetryAfter(null)).toBeNull();
        expect(parseRetryAfter('')).toBeNull();
        expect(parseRetryAfter('soon')).toBeNull();
    });
});

describe('fetchTransport', () => {
    it('passes the caller’s signal to fetch', async () => {
        const fetch = vi.fn(async () =>
            Response.json({ tasks: [], cursor: 0, has_more: false }),
        );
        vi.stubGlobal('fetch', fetch);
        const controller = new AbortController();

        await fetchTransport.pull(0, 10, controller.signal);

        expect(fetch).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining({ signal: controller.signal }),
        );
    });

    it('reports the status and Retry-After of a failed request', async () => {
        vi.stubGlobal('fetch', async () => {
            return new Response('{}', {
                status: 429,
                headers: { 'Retry-After': '12' },
            });
        });

        const error = await fetchTransport.push([]).catch((e: unknown) => e);

        expect(error).toBeInstanceOf(SyncHttpError);
        expect(error).toMatchObject({ status: 429, retryAfterMs: 12_000 });
    });
});
