type Callback = () => Promise<unknown>;

/**
 * An in-memory, single-page `navigator.locks` (one exclusive lock name is
 * enough for the sync lock), honouring `signal` while a request waits.
 */
export function createFakeLocks() {
    const queue: Array<() => void> = [];
    let held = false;

    function release() {
        held = false;
        queue.shift()?.();
    }

    const locks = {
        get held() {
            return held;
        },
        request(
            _name: string,
            options: { signal?: AbortSignal },
            callback: Callback,
        ): Promise<void> {
            return new Promise((resolve, reject) => {
                const grant = () => {
                    held = true;
                    Promise.resolve()
                        .then(callback)
                        .then(
                            () => {
                                release();
                                resolve();
                            },
                            (error: unknown) => {
                                release();
                                reject(error);
                            },
                        );
                };

                if (!held) {
                    grant();

                    return;
                }

                queue.push(grant);
                options.signal?.addEventListener('abort', () => {
                    const index = queue.indexOf(grant);

                    if (index >= 0) {
                        queue.splice(index, 1);
                        reject(new DOMException('Aborted.', 'AbortError'));
                    }
                });
            });
        },
    };

    return locks;
}
