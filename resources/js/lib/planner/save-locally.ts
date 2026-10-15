import { toast } from 'sonner';

type Options<T> = {
    /** Toast shown when the write fails. */
    error?: string;
    /** Runs once the write is committed. */
    onSaved?: (value: T) => void;
};

/**
 * Runs a local write without making the UI wait for it. Writes only touch
 * IndexedDB; a failure (quota, a task deleted meanwhile) shows a toast.
 */
export function saveLocally<T>(
    write: Promise<T>,
    { error = 'Could not update the task.', onSaved }: Options<T> = {},
): void {
    write.then(onSaved, () => toast.error(error));
}
