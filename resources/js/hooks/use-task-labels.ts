import { useLiveQuery } from 'dexie-react-hooks';
import { useCallback, useMemo } from 'react';
import { queryLabels, setLabelName } from '@/lib/db/labels';
import type { LabelColor, TaskColor } from '@/lib/db/types';
import { TASK_COLOR_STYLES } from '@/lib/planner/task-colors';
import { resolveLabels } from '@/lib/planner/task-labels';
import type { TaskLabelView } from '@/lib/planner/task-labels';

export type TaskLabels = {
    /**
     * Every label colour in picker order with its effective name. Until the
     * first local read is done, every colour has its default name.
     */
    labels: TaskLabelView[];
    /** True only during the first local read. */
    isLoading: boolean;
    /** Renames a colour; `''` gives it back its default name. */
    setLabelName: (color: LabelColor, name: string) => Promise<void>;
};

/** The live label names (local, synced with the account). */
export function useTaskLabels(): TaskLabels {
    const stored = useLiveQuery(queryLabels, []);
    const labels = useMemo(() => resolveLabels(stored ?? []), [stored]);

    return { labels, isLoading: stored === undefined, setLabelName };
}

/**
 * The name to show for a task color in a picker: its label's effective name,
 * or "No color" for `none`.
 */
export function useTaskColorName(): (color: TaskColor) => string {
    const { labels } = useTaskLabels();

    return useCallback(
        (color: TaskColor) =>
            labels.find((label) => label.color === color)?.name ??
            TASK_COLOR_STYLES[color].label,
        [labels],
    );
}
