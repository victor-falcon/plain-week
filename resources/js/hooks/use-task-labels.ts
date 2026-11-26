import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';
import { queryLabels, setLabelName } from '@/lib/db/labels';
import type { LabelColor } from '@/lib/db/types';
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
