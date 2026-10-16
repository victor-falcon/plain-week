import { toast } from 'sonner';

/**
 * The toasts that offer "Undo" (a move, a delete), and the `u` shortcut that
 * presses the latest one. Only the latest toast still on screen can be undone
 * with `u`: once it is dismissed or times out, a later edit could otherwise
 * be overwritten by restoring an old snapshot.
 */

type PendingUndo = { toastId: string | number; run: () => void };

let latest: PendingUndo | null = null;

/** Shows `message` with an "Undo" action that runs `onUndo` once. */
export function toastWithUndo(message: string, onUndo: () => void): void {
    let done = false;
    const pending: PendingUndo = {
        toastId: '',
        run: () => {
            if (latest === pending) {
                latest = null;
            }

            if (!done) {
                done = true;
                onUndo();
            }
        },
    };
    const forget = () => {
        if (latest === pending) {
            latest = null;
        }
    };

    pending.toastId = toast(message, {
        action: { label: 'Undo', onClick: pending.run },
        onDismiss: forget,
        onAutoClose: forget,
    });
    latest = pending;
}

/**
 * Undoes what the latest "Undo" toast on screen offers and closes it.
 * Returns whether there was one.
 */
export function undoLatest(): boolean {
    const pending = latest;

    if (pending === null) {
        return false;
    }

    pending.run();
    toast.dismiss(pending.toastId);

    return true;
}
