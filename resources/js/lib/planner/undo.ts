import { toast } from 'sonner';

/**
 * The toasts that offer "Undo" (a move, a delete), and the `u` shortcut that
 * presses the newest one still on screen. A toast that was dismissed or timed
 * out cannot be undone with `u`: restoring its old snapshot could overwrite
 * later edits.
 */

type PendingUndo = { toastId: string | number; run: () => void };

/** Undo toasts on screen, oldest first. */
let pending: PendingUndo[] = [];

function forget(entry: PendingUndo) {
    pending = pending.filter((other) => other !== entry);
}

/** Shows `message` with an "Undo" action that runs `onUndo` once. */
export function toastWithUndo(message: string, onUndo: () => void): void {
    let done = false;
    const run = () => {
        forget(entry);

        if (!done) {
            done = true;
            onUndo();
        }
    };
    const toastId = toast(message, {
        action: { label: 'Undo', onClick: run },
        onDismiss: () => forget(entry),
        onAutoClose: () => forget(entry),
    });
    const entry: PendingUndo = { toastId, run };

    pending.push(entry);
}

/**
 * Undoes what the newest "Undo" toast on screen offers and closes it.
 * Returns whether there was one.
 */
export function undoLatest(): boolean {
    const entry = pending.at(-1);

    if (!entry) {
        return false;
    }

    entry.run();
    toast.dismiss(entry.toastId);

    return true;
}
