import { MAX_EVERY_DAYS, SOMEDAY_COLUMNS, TASK_COLORS } from '@/lib/db/types';
import { isValidEvery } from '@/lib/recurrence/expand';
import type {
    IsoWeekday,
    Recurrence,
    SomedayColumn,
    Subtask,
    Task,
    TaskColor,
} from '@/lib/db/types';

/**
 * Validation of imported task rows. It mirrors the server's push rules
 * (`App\Http\Requests\Sync\PushRequest`), so an imported row never gets a 422
 * when it syncs. Ids are checked for presence and uniqueness only: the import
 * replaces every id anyway.
 */

/** A file that cannot be imported; `message` is shown to the user. */
export class ImportError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ImportError';
    }
}

const DATE_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const RECURRENCE_KEYS = ['type', 'every', 'weekdays', 'day', 'until'];
const MAX_POSITION_LENGTH = 255;
const MAX_SUBTASK_ID_LENGTH = 255;

type Row = Record<string, unknown>;

function isObject(value: unknown): value is Row {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A real calendar day in `YYYY-MM-DD` (Laravel `date_format:Y-m-d`). */
export function isDateKey(value: unknown): value is string {
    if (typeof value !== 'string') {
        return false;
    }

    const match = DATE_KEY.exec(value);

    if (!match) {
        return false;
    }

    const [year, month, day] = match.slice(1).map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));

    return (
        date.getUTCFullYear() === year &&
        date.getUTCMonth() === month - 1 &&
        date.getUTCDate() === day
    );
}

/** Exactly what `Date.prototype.toISOString()` produces. */
export function isTimestamp(value: unknown): value is string {
    if (typeof value !== 'string' || !TIMESTAMP.test(value)) {
        return false;
    }

    const date = new Date(value);

    return !Number.isNaN(date.getTime()) && date.toISOString() === value;
}

class RowValidator {
    constructor(
        private readonly row: Row,
        private readonly label: string,
    ) {}

    fail(field: string, rule: string): never {
        throw new ImportError(`${this.label}: "${field}" ${rule}.`);
    }

    has(field: string): boolean {
        return Object.hasOwn(this.row, field);
    }

    present(field: string): unknown {
        if (!this.has(field)) {
            this.fail(field, 'is missing');
        }

        return this.row[field];
    }

    string(field: string): string {
        const value = this.present(field);

        if (typeof value !== 'string') {
            this.fail(field, 'must be a string');
        }

        return value;
    }

    nonEmptyString(field: string): string {
        const value = this.string(field);

        if (value === '') {
            this.fail(field, 'cannot be empty');
        }

        return value;
    }

    boolean(field: string): boolean {
        const value = this.present(field);

        if (typeof value !== 'boolean') {
            this.fail(field, 'must be true or false');
        }

        return value;
    }

    nullable<T>(
        field: string,
        check: (value: unknown) => value is T,
        rule: string,
    ): T | null {
        const value = this.present(field);

        if (value === null) {
            return null;
        }

        if (!check(value)) {
            this.fail(field, rule);
        }

        return value;
    }

    timestamp(field: string): string {
        const value = this.present(field);

        if (!isTimestamp(value)) {
            this.fail(
                field,
                'must be a timestamp like 2026-10-15T08:35:00.123Z',
            );
        }

        return value;
    }
}

function parseSubtasks(v: RowValidator, value: unknown): Subtask[] {
    if (!Array.isArray(value)) {
        v.fail('subtasks', 'must be a list');
    }

    return value.map((subtask: unknown, index) => {
        const field = `subtasks[${index}]`;

        if (!isObject(subtask)) {
            v.fail(field, 'must be an object');
        }

        const { id, text, done } = subtask;

        if (
            typeof id !== 'string' ||
            id === '' ||
            id.length > MAX_SUBTASK_ID_LENGTH
        ) {
            v.fail(
                `${field}.id`,
                `must be a string of 1 to ${MAX_SUBTASK_ID_LENGTH} characters`,
            );
        }

        if (typeof text !== 'string') {
            v.fail(`${field}.text`, 'must be a string');
        }

        if (typeof done !== 'boolean') {
            v.fail(`${field}.done`, 'must be true or false');
        }

        return { id, text, done };
    });
}

function parseRecurrence(v: RowValidator, value: unknown): Recurrence | null {
    if (value === null) {
        return null;
    }

    if (!isObject(value)) {
        v.fail('recurrence', 'must be an object or null');
    }

    const extra = Object.keys(value).find(
        (key) => !RECURRENCE_KEYS.includes(key),
    );

    if (extra !== undefined) {
        v.fail('recurrence', `has an unknown key "${extra}"`);
    }

    const until = value.until ?? null;

    if (until !== null && !isDateKey(until)) {
        v.fail('recurrence.until', 'must be a date like 2026-10-15 or null');
    }

    const end = until === null ? {} : { until };

    if (value.type === 'daily') {
        const { every } = value;

        if (
            Object.hasOwn(value, 'weekdays') ||
            Object.hasOwn(value, 'day') ||
            !isValidEvery(every)
        ) {
            v.fail(
                'recurrence.every',
                `must be a number of days from 1 to ${MAX_EVERY_DAYS}`,
            );
        }

        return { type: 'daily', every: every as number, ...end };
    }

    if (value.type === 'weekly') {
        const { weekdays } = value;

        if (
            Object.hasOwn(value, 'every') ||
            Object.hasOwn(value, 'day') ||
            !Array.isArray(weekdays) ||
            weekdays.length === 0 ||
            weekdays.length > 7 ||
            !weekdays.every(
                (day, i) =>
                    Number.isInteger(day) &&
                    day >= 1 &&
                    day <= 7 &&
                    (i === 0 || day > weekdays[i - 1]),
            )
        ) {
            v.fail(
                'recurrence.weekdays',
                'must be a sorted list of unique weekdays from 1 to 7',
            );
        }

        return { type: 'weekly', weekdays: weekdays as IsoWeekday[], ...end };
    }

    if (value.type === 'monthly') {
        const { day } = value;

        if (
            Object.hasOwn(value, 'every') ||
            Object.hasOwn(value, 'weekdays') ||
            !Number.isInteger(day) ||
            (day as number) < 1 ||
            (day as number) > 31
        ) {
            v.fail('recurrence.day', 'must be a day of the month from 1 to 31');
        }

        return { type: 'monthly', day: day as number, ...end };
    }

    return v.fail('recurrence.type', 'must be "daily", "weekly" or "monthly"');
}

function isSomedayColumn(value: unknown): value is SomedayColumn {
    return SOMEDAY_COLUMNS.includes(value as SomedayColumn);
}

function isTime(value: unknown): value is string {
    return typeof value === 'string' && TIME.test(value);
}

/**
 * Validates one row of an export file and returns it in the stored shape
 * (unknown keys dropped). `index` is zero-based; messages count from 1.
 */
export function validateTask(value: unknown, index: number): Task {
    const label = `Task ${index + 1}`;

    if (!isObject(value)) {
        throw new ImportError(`${label} is not an object.`);
    }

    const v: RowValidator = new RowValidator(value, label);
    const date = v.nullable(
        'date',
        isDateKey,
        'must be a date like 2026-10-15 or null',
    );
    const somedayColumn = v.nullable(
        'someday_column',
        isSomedayColumn,
        'must be 0, 1, 2 or null',
    );

    if (date === null && somedayColumn === null) {
        v.fail('someday_column', 'is required when "date" is null');
    }

    const position = v.nonEmptyString('position');

    if (position.length > MAX_POSITION_LENGTH) {
        v.fail('position', `must be at most ${MAX_POSITION_LENGTH} characters`);
    }

    const color = v.present('color');

    if (!TASK_COLORS.includes(color as TaskColor)) {
        v.fail('color', `must be one of ${TASK_COLORS.join(', ')}`);
    }

    const recurrence = parseRecurrence(v, v.present('recurrence'));
    const seriesId = v.nullable(
        'series_id',
        (id): id is string => typeof id === 'string' && id !== '',
        'must be a task id or null',
    );
    const occurrenceDate = v.nullable(
        'occurrence_date',
        isDateKey,
        'must be a date like 2026-10-15 or null',
    );
    const id = v.nonEmptyString('id');
    const deletedAt = v.nullable(
        'deleted_at',
        isTimestamp,
        'must be a timestamp or null',
    );

    if (seriesId === id) {
        v.fail('series_id', 'cannot be the task itself');
    }

    // Row kinds (plain, series, exception). Tombstones skip these checks, like
    // on the server.
    if (deletedAt === null) {
        if (recurrence !== null) {
            if (date === null) {
                v.fail('date', 'is required for a recurring task');
            }

            if (seriesId !== null || occurrenceDate !== null) {
                v.fail(
                    'recurrence',
                    'cannot be set on an exception of a series',
                );
            }

            if (recurrence.until && recurrence.until < date) {
                v.fail('recurrence.until', 'cannot be before the task date');
            }
        } else if ((seriesId === null) !== (occurrenceDate === null)) {
            v.fail(
                seriesId === null ? 'series_id' : 'occurrence_date',
                'is required on an exception of a series',
            );
        }
    }

    return {
        id,
        text: v.string('text'),
        date,
        someday_column: date === null ? somedayColumn : null,
        position,
        done: v.boolean('done'),
        done_at: v.nullable(
            'done_at',
            isTimestamp,
            'must be a timestamp or null',
        ),
        color: color as TaskColor,
        time: v.nullable('time', isTime, 'must be a time like 09:30 or null'),
        notes: v.string('notes'),
        subtasks: parseSubtasks(v, v.present('subtasks')),
        created_at: v.timestamp('created_at'),
        updated_at: v.timestamp('updated_at'),
        deleted_at: deletedAt,
        recurrence,
        series_id: seriesId,
        occurrence_date: occurrenceDate,
    };
}
