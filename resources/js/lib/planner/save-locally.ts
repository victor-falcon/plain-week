import { toast } from 'sonner';
import { t } from '@/lib/i18n';

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
    { error, onSaved }: Options<T> = {},
): void {
    write.then(onSaved, () =>
        toast.error(error ?? t('planner.updateTaskFailed')),
    );
}
