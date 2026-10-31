import 'fake-indexeddb/auto';
import { afterAll, vi } from 'vitest';

/**
 * Sonner unmounts a dismissed toast from a 200 ms `setTimeout` it never clears
 * (`TIME_BEFORE_UNMOUNT` in sonner's dist), started after two
 * `requestAnimationFrame` ticks. If a test file ends inside that window, the
 * timer fires after the DOM environment is torn down and React's setState
 * throws "window is not defined" as an unhandled error. Files that showed a
 * toast wait it out here, while `window` still exists. This hook is
 * registered first, so it runs after each file's own `afterAll`.
 */
const SONNER_SETTLE_MS = 400;

afterAll(async () => {
    if (typeof window === 'undefined') {
        return;
    }

    // Same module instance as the test file's, so its history is shared.
    const { toast } = await import('sonner');

    if (toast.getHistory().length === 0) {
        return;
    }

    vi.useRealTimers();
    await new Promise((resolve) => setTimeout(resolve, SONNER_SETTLE_MS));
});
