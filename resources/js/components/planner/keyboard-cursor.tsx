import {
    createContext,
    use,
    useCallback,
    useEffect,
    useEffectEvent,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import type { ReactNode, RefObject } from 'react';
import { toast } from 'sonner';
import { useScopePrompt } from '@/components/planner/scope-prompt';
import { openContextMenuAt } from '@/components/planner/task-context-menu';
import { usePlannerShortcuts } from '@/hooks/use-planner-shortcuts';
import type { ShortcutHandlers } from '@/hooks/use-planner-shortcuts';
import { parseDateKey, toDateKey, weekDateKeys } from '@/lib/db/dates';
import { placementOf } from '@/lib/db/queries';
import { moveTask, toggleDone } from '@/lib/db/tasks';
import type { MoveTaskInput, TaskPlacement } from '@/lib/db/tasks';
import {
    CURSOR_ROW_STOP_SELECTOR,
    CURSOR_STOP_SELECTOR,
    compareListKeys,
    cursorOnTask,
    cursorAfterRemoval,
    firstInList,
    initialCursor,
    lastInList,
    moveCursor,
    newTaskRowCursor,
    resolveCursor,
    shiftCursorWeeks,
} from '@/lib/planner/cursor';
import type { Cursor, CursorList } from '@/lib/planner/cursor';
import { placementKey, resolveListDrop } from '@/lib/planner/drop';
import { shortcutsDialogStore } from '@/lib/planner/shortcuts-dialog';
import {
    SOMEDAY_MOVE,
    deleteWithUndo,
    duplicateWithToast,
    moveWithUndo,
    needsScope,
    nextWeekMove,
} from '@/lib/planner/task-actions';
import { undoLatest } from '@/lib/planner/undo';
import { addDays } from '@/lib/planner/week';
import type { PlannerTask } from '@/lib/recurrence/expand';

/** A list on screen, as its `TaskList` registers it. */
type ListEntry = { placement: TaskPlacement; tasks: PlannerTask[] };

type CursorApi = {
    /** A `TaskList` reports its tasks while it is on screen. */
    registerList: (key: string, entry: ListEntry) => () => void;
    /** Esc in a list's new-task input: back to the cursor, on that list. */
    returnToList: (key: string) => void;
    /** Whether the cursor moved with a key since its row last took focus. */
    takeFocusRequest: () => boolean;
    /** Focuses the cursor's row (focus-follow ignores it). */
    focusRow: (element: HTMLElement) => void;
};

const CursorContext = createContext<Cursor | null>(null);
/** Counts the key-driven cursor moves: each one gives the cursor's row focus. */
const FocusTickContext = createContext(0);
const CursorApiContext = createContext<CursorApi | null>(null);

/** How the row under the cursor looks (task rows and new-task rows). */
export const CURSOR_ROW_CLASS =
    'data-cursor:rounded-sm data-cursor:bg-accent data-cursor:ring-2 data-cursor:ring-ring data-cursor:ring-inset';

/** The keyboard cursor (resolved), or `null` when it is hidden. */
export function useKeyboardCursor(): Cursor | null {
    return use(CursorContext);
}

const NOOP_API: CursorApi = {
    registerList: () => () => {},
    returnToList: () => {},
    takeFocusRequest: () => false,
    focusRow: (element) => element.focus(),
};

/** The cursor's API; a no-op outside the planner (component tests). */
export function useKeyboardCursorApi(): CursorApi {
    return use(CursorApiContext) ?? NOOP_API;
}

/**
 * Gives the cursor's row real focus (so screen readers follow it and the
 * focus ring shows): when it moved with a key, or when focus was lost (the
 * row re-rendered elsewhere after a move) or sits on a stop the cursor has
 * left. Focus already inside the row (its check button), in a field or in a
 * dialog stays where it is.
 */
export function useCursorFocus<T extends HTMLElement>(
    isCursor: boolean,
): RefObject<T | null> {
    const ref = useRef<T>(null);
    const { takeFocusRequest, focusRow } = useKeyboardCursorApi();
    const focusTick = use(FocusTickContext);

    useLayoutEffect(() => {
        const element = ref.current;

        if (!isCursor || !element) {
            return;
        }

        const row =
            element.closest('[data-task-id], [data-new-task-row]') ?? element;
        const active = document.activeElement;
        const requested = takeFocusRequest();

        if (row.contains(active)) {
            return;
        }

        const lost =
            active === null ||
            active === document.body ||
            active.matches(CURSOR_STOP_SELECTOR);

        if (requested || lost) {
            focusRow(element);
        }
    }, [isCursor, focusTick, takeFocusRequest, focusRow]);

    return ref;
}

/**
 * Hands focus back to the row under the cursor (a dialog closing). Returns
 * whether the cursor is shown.
 */
export function focusCursorRow(): boolean {
    const stop = document.querySelector<HTMLElement>(CURSOR_ROW_STOP_SELECTOR);
    stop?.focus();

    return stop !== null;
}

/** The cursor of the task or new-task row `element` is in, if any. */
function cursorFromElement(
    lists: CursorList[],
    element: Element | null,
): Cursor | null {
    const taskId = element
        ?.closest('[data-task-id]')
        ?.getAttribute('data-task-id');

    if (taskId) {
        return cursorOnTask(lists, taskId);
    }

    const listKey = element
        ?.closest('[data-new-task-row]')
        ?.closest('[data-list]')
        ?.getAttribute('data-list');
    const list = lists.find(({ key }) => key === listKey);

    return list ? newTaskRowCursor(list.key) : null;
}

/** The cursor of the task or new-task row that has focus, if any. */
function cursorFromFocus(lists: CursorList[]): Cursor | null {
    return cursorFromElement(lists, document.activeElement);
}

/**
 * The cursor of the row under the mouse, if any: its key hint (`o`, `a`)
 * says a key acts on it.
 */
function cursorFromHover(lists: CursorList[]): Cursor | null {
    return cursorFromElement(
        lists,
        document.querySelector(
            '[data-task-id]:hover, [data-new-task-row]:hover',
        ),
    );
}

function sameCursor(a: Cursor | null, b: Cursor | null): boolean {
    return (
        a?.listKey === b?.listKey &&
        a?.taskId === b?.taskId &&
        a?.index === b?.index
    );
}

function rowOf(taskId: string): HTMLElement | null {
    return document.querySelector<HTMLElement>(
        `[data-task-id="${CSS.escape(taskId)}"]`,
    );
}

/** Starts typing a new task in a list: focuses its first empty row. */
function focusNewTaskInput(listKey: string): boolean {
    const input = document.querySelector<HTMLInputElement>(
        `[data-list="${CSS.escape(listKey)}"] [data-new-task-row] input`,
    );
    input?.focus();

    return input !== null;
}

type Navigation = {
    weekStart: Date;
    previousWeek: () => void;
    nextWeek: () => void;
    goToToday: () => void;
};

type Props = {
    /** 'YYYY-MM-DD' of today. */
    today: string;
    navigation: Navigation;
    onOpenTask: (taskId: string) => void;
    /** `,`; `undefined` when there is no settings page (guests). */
    onOpenSettings?: () => void;
    children: ReactNode;
};

/**
 * The planner's keyboard mode: a cursor over the tasks on screen moved with
 * h / j / k / l, and the shortcuts that act on its task, change weeks and
 * open the shortcuts dialog (`lib/planner/shortcuts.ts`). Every action writes
 * the local database only, like the mouse ones.
 *
 * The cursor is hidden until a shortcut key is pressed, and hides again on
 * any pointer press. Its row has real focus (roving: the task's text button,
 * or the new-task row's stop), so screen readers announce it. It follows its
 * task when the task moves, and falls back to the same row of its list when
 * the task is gone.
 */
export function KeyboardCursorProvider({
    today,
    navigation,
    onOpenTask,
    onOpenSettings,
    children,
}: Props) {
    const [entries, setEntries] = useState<ReadonlyMap<string, ListEntry>>(
        () => new Map(),
    );
    const [cursor, setCursor] = useState<Cursor | null>(null);
    const focusRequest = useRef(false);
    const focusing = useRef(false);
    const [focusTick, setFocusTick] = useState(0);
    const entriesRef = useRef(entries);
    // Tasks with a move or delete in flight: a quick second press would act
    // on their state from before the first one.
    const busy = useRef(new Set<string>());
    // The row the cursor was last on in each list it left with h / l.
    const rows = useRef(new Map<string, number>());
    const askScope = useScopePrompt();

    const lists = useMemo<CursorList[]>(
        () =>
            [...entries.keys()].sort(compareListKeys).map((key) => ({
                key,
                taskIds: entries.get(key)!.tasks.map((task) => task.id),
            })),
        [entries],
    );
    const resolved = useMemo(
        () => resolveCursor(lists, cursor),
        [lists, cursor],
    );

    useLayoutEffect(() => {
        entriesRef.current = entries;
    });

    const registerList = useCallback((key: string, entry: ListEntry) => {
        setEntries((current) => new Map(current).set(key, entry));

        return () =>
            setEntries((current) => {
                const next = new Map(current);
                next.delete(key);

                return next;
            });
    }, []);

    /** Puts the cursor somewhere with a key: its row takes focus. */
    const show = useCallback((next: Cursor | null) => {
        focusRequest.current = next !== null;
        setCursor(next);
        setFocusTick((tick) => tick + 1);
    }, []);

    const api = useMemo<CursorApi>(
        () => ({
            registerList,
            returnToList: (key) => {
                if (entriesRef.current.has(key)) {
                    show(newTaskRowCursor(key));
                }
            },
            takeFocusRequest: () => {
                const requested = focusRequest.current;
                focusRequest.current = false;

                return requested;
            },
            focusRow: (element) => {
                focusing.current = true;
                element.focus();
                focusing.current = false;
            },
        }),
        [registerList, show],
    );

    // Mouse and touch users never see the cursor.
    useEffect(() => {
        const hide = () => {
            focusRequest.current = false;
            setCursor(null);
        };
        window.addEventListener('pointerdown', hide, { capture: true });

        return () =>
            window.removeEventListener('pointerdown', hide, { capture: true });
    }, []);

    // While shown, the cursor follows focus (Tab, the task dialog handing
    // focus back to its task under a new id).
    const onFocusIn = useEffectEvent(() => {
        if (cursor === null || focusing.current) {
            return;
        }

        const focused = cursorFromFocus(lists);

        if (focused && !sameCursor(focused, resolved)) {
            setCursor(focused);
        }
    });

    useEffect(() => {
        const listener = () => onFocusIn();
        window.addEventListener('focusin', listener);

        return () => window.removeEventListener('focusin', listener);
    }, []);

    /** The cursor to act on: the shown one, or the focused row's. */
    const current = (): Cursor | null => resolved ?? cursorFromFocus(lists);

    /**
     * For `o` and `a` only (the keys the rows hint on hover): also the hovered
     * row's. Destructive keys never act on a row the mouse just rests on.
     */
    const currentOrHovered = (): Cursor | null =>
        current() ?? cursorFromHover(lists);

    const taskAt = (at: Cursor): PlannerTask | null => {
        if (at.taskId === null) {
            return null;
        }

        return (
            entries.get(at.listKey)?.tasks.find((t) => t.id === at.taskId) ??
            null
        );
    };

    const move = (motion: (at: Cursor) => Cursor) => {
        const at = current();

        show(at ? motion(at) : initialCursor(lists, today));
    };

    /** Runs `action` on the cursor's task; `false` when there is none. */
    const onTask =
        (action: (task: PlannerTask, at: Cursor) => void) => (): boolean => {
            const at = current();
            const task = at && taskAt(at);

            if (!at || !task) {
                return false;
            }

            action(task, at);

            return true;
        };

    /** The cursor stays on a task whose id changed (an occurrence written). */
    const follow = (from: string, to: string) =>
        setCursor((at) => (at?.taskId === from ? { ...at, taskId: to } : at));

    /** Runs a write on `task` unless one is still in flight. */
    const once = <T,>(task: PlannerTask, write: () => Promise<T>) => {
        if (busy.current.has(task.id)) {
            return;
        }

        busy.current.add(task.id);
        void write().finally(() => busy.current.delete(task.id));
    };

    /** Moves the task and keeps the cursor on it. */
    const moveAndFollow = (task: PlannerTask, input: MoveTaskInput) =>
        once(task, () =>
            moveTask(task.id, input).then(
                (moved) =>
                    show({
                        listKey: placementKey(placementOf(moved)),
                        taskId: moved.id,
                        index: 0,
                    }),
                () => toast.error('Could not move the task.'),
            ),
        );

    const reorder = (direction: -1 | 1) =>
        onTask((task, at) => {
            const entry = entries.get(at.listKey);
            const drop =
                entry &&
                resolveListDrop(
                    task,
                    entry.placement,
                    entry.tasks,
                    direction === -1 ? at.index - 1 : at.index + 2,
                );

            if (drop) {
                moveAndFollow(task, drop.move);
            }
        });

    const shiftDay = (days: -1 | 1) =>
        onTask((task) => {
            if (task.date === null) {
                return;
            }

            const date = toDateKey(addDays(parseDateKey(task.date), days));
            const shown = weekDateKeys(navigation.weekStart);

            moveAndFollow(task, { date });

            if (date < shown[0]) {
                navigation.previousWeek();
            } else if (date > shown[6]) {
                navigation.nextWeek();
            }
        });

    /** The task leaves the list: the cursor stays on its row. */
    const leave = (at: Cursor) => show(cursorAfterRemoval(lists, at));

    /** h / l: remembers the row it leaves, and goes back to the one it had
     * in the next list. */
    const across = (motion: 'previousList' | 'nextList') => (at: Cursor) => {
        rows.current.set(at.listKey, at.index);

        return moveCursor(lists, at, motion, rows.current);
    };

    const changeWeek = (weeks: -1 | 1) => () => {
        rows.current.clear();

        if (weeks === -1) {
            navigation.previousWeek();
        } else {
            navigation.nextWeek();
        }

        if (resolved) {
            show(shiftCursorWeeks(resolved, weeks));
        }
    };

    const handlers: ShortcutHandlers = {
        'cursor.previousDay': () => move(across('previousList')),
        'cursor.nextDay': () => move(across('nextList')),
        'cursor.down': () => move((at) => moveCursor(lists, at, 'down')),
        'cursor.up': () => move((at) => moveCursor(lists, at, 'up')),
        'cursor.first': () => move((at) => firstInList(lists, at)),
        'cursor.last': () => move((at) => lastInList(lists, at)),
        'cursor.clear': () => {
            if (resolved === null) {
                return false;
            }

            setCursor(null);

            if (document.activeElement?.closest('[data-list]')) {
                (document.activeElement as HTMLElement).blur();
            }
        },
        'task.open': () => {
            const at = currentOrHovered();
            const task = at && taskAt(at);

            if (task) {
                onOpenTask(task.id);

                return true;
            }

            // Enter on a new-task row starts typing there.
            return at !== null && focusNewTaskInput(at.listKey);
        },
        'task.toggleDone': onTask((task) => {
            toggleDone(task.id).then(
                (toggled) => follow(task.id, toggled.id),
                () => toast.error('Could not update the task.'),
            );
        }),
        'task.moveDown': reorder(1),
        'task.moveUp': reorder(-1),
        'task.nextDay': shiftDay(1),
        'task.previousDay': shiftDay(-1),
        'task.nextWeek': onTask((task, at) =>
            once(task, () => {
                leave(at);

                return moveWithUndo(task.id, nextWeekMove(task));
            }),
        ),
        'task.someday': onTask((task, at) => {
            if (task.date !== null) {
                once(task, () => {
                    leave(at);

                    return moveWithUndo(task.id, SOMEDAY_MOVE);
                });
            }
        }),
        'task.duplicate': onTask((task) => void duplicateWithToast(task.id)),
        'task.delete': onTask((task, at) =>
            once(task, async () => {
                const scope = (await needsScope(task))
                    ? await askScope('delete')
                    : undefined;

                if (scope !== null) {
                    leave(at);
                    await deleteWithUndo(task.id, scope);
                }
            }),
        ),
        'task.menu': onTask((task) => {
            const row = rowOf(task.id);

            if (row) {
                const rect = row.getBoundingClientRect();
                const rtl = getComputedStyle(row).direction === 'rtl';
                openContextMenuAt(
                    row,
                    rtl ? rect.right : rect.left,
                    rect.bottom,
                );
            }
        }),
        'task.new': () => {
            const at = currentOrHovered() ?? initialCursor(lists, today);

            return at !== null && focusNewTaskInput(at.listKey);
        },
        'week.previous': changeWeek(-1),
        'week.next': changeWeek(1),
        'week.today': () => {
            rows.current.clear();
            navigation.goToToday();
            show({ listKey: today, taskId: null, index: 0 });
        },
        'general.undo': () => undoLatest(),
        'general.settings': onOpenSettings ? () => onOpenSettings() : undefined,
        'general.help': () => shortcutsDialogStore.open(),
    };

    usePlannerShortcuts(handlers);

    return (
        <CursorApiContext value={api}>
            <CursorContext value={resolved}>
                <FocusTickContext value={focusTick}>
                    {children}
                </FocusTickContext>
            </CursorContext>
        </CursorApiContext>
    );
}
