type Listener = () => void;

const listeners = new Set<Listener>();

/** Subscribes to local mutations (used by the sync engine). */
export function onLocalChange(listener: Listener): () => void {
    listeners.add(listener);

    return () => {
        listeners.delete(listener);
    };
}

export function notifyLocalChange(): void {
    listeners.forEach((listener) => listener());
}
