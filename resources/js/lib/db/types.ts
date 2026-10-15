/**
 * Task colour ids, in the order the colour picker shows them. Visual styles
 * (swatches, text colours) belong to the UI layer, not here.
 */
export const TASK_COLORS = [
    'none',
    'pink',
    'yellow',
    'black',
    'grey',
    'cornflower',
    'mango',
    'green',
    'lilac',
] as const;

export type TaskColor = (typeof TASK_COLORS)[number];

/** Someday has three columns. */
export const SOMEDAY_COLUMNS = [0, 1, 2] as const;

export type SomedayColumn = (typeof SOMEDAY_COLUMNS)[number];

export type Subtask = {
    id: string;
    text: string;
    done: boolean;
};

/**
 * A task, with exactly the shape of the sync contract (docs/architecture.md).
 * Keys are snake_case in Dexie and on the wire.
 */
export type Task = {
    id: string;
    text: string;
    /** 'YYYY-MM-DD', or null for Someday. */
    date: string | null;
    /** Required when `date` is null, otherwise null. */
    someday_column: SomedayColumn | null;
    /** Fractional index key; order within a day or Someday column. */
    position: string;
    done: boolean;
    done_at: string | null;
    color: TaskColor;
    /** 'HH:mm' or null. */
    time: string | null;
    notes: string;
    subtasks: Subtask[];
    created_at: string;
    updated_at: string;
    deleted_at: string | null;
};

/**
 * A pending local change. `revision` grows on every local mutation of the task,
 * so the sync engine can tell whether a record changed while it was in flight.
 */
export type OutboxEntry = {
    task_id: string;
    revision: number;
    /**
     * Set when the server refused this revision as invalid (422). The entry is
     * skipped by push until the task changes again.
     */
    failed_revision?: number;
};

export type MetaKey = 'cursor' | 'user_id';

export type MetaEntry = {
    key: MetaKey;
    value: string | number;
};
