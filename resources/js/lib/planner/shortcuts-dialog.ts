/**
 * Whether the shortcuts dialog is open: an external store (for
 * `useSyncExternalStore`), so `?` and the account menu can open it.
 */

const listeners = new Set<() => void>();
let open = false;

function setOpen(value: boolean) {
    open = value;
    listeners.forEach((listener) => listener());
}

export const shortcutsDialogStore = {
    subscribe: (listener: () => void) => {
        listeners.add(listener);

        return () => {
            listeners.delete(listener);
        };
    },
    isOpen: () => open,
    /** `?`, or "Keyboard shortcuts" in the account menu. */
    open: () => setOpen(true),
    close: () => setOpen(false),
};
