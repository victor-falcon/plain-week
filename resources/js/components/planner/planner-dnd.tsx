import {
    DndContext,
    DragOverlay,
    KeyboardSensor,
    MeasuringStrategy,
    MouseSensor,
    TouchSensor,
    closestCenter,
    pointerWithin,
    rectIntersection,
    useDroppable,
    useSensor,
    useSensors,
} from '@dnd-kit/core';
import type {
    Announcements,
    Collision,
    CollisionDetection,
    DragEndEvent,
    DragMoveEvent,
    DragStartEvent,
    ScreenReaderInstructions,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import {
    createContext,
    use,
    useEffect,
    useEffectEvent,
    useRef,
    useState,
} from 'react';
import type { ReactNode } from 'react';
import { toast } from 'sonner';
import { TaskLabel } from '@/components/planner/task-row';
import { moveTask } from '@/lib/db/tasks';
import type { TaskPlacement } from '@/lib/db/tasks';
import type { Task } from '@/lib/db/types';
import { placementLabel, resolveDrop } from '@/lib/planner/drop';
import type { DropResult, DropTarget, WeekDirection } from '@/lib/planner/drop';
import { cn } from '@/lib/utils';

/** Hovering an edge zone this long shows the previous / next week. */
export const EDGE_HOVER_DELAY_MS = 600;

/** Data attached to each draggable task row (`useSortable`). */
export type TaskDragData = {
    type: 'task';
    task: Task;
    placement: TaskPlacement;
    tasks: Task[];
};

/** Data attached to each list (`useDroppable` on a day or Someday column). */
export type ListDropData = {
    type: 'list';
    placement: TaskPlacement;
    tasks: Task[];
};

type EdgeDropData = { type: 'edge'; direction: WeekDirection };

type DropData = TaskDragData | ListDropData | EdgeDropData;

/** Collision data: whether the probe is in the lower half of a task row. */
type ProbeData = { below?: boolean };

export function listDroppableId(listKey: string): string {
    return `list:${listKey}`;
}

const EDGE_IDS: Record<WeekDirection, string> = {
    [-1]: 'edge:previous',
    1: 'edge:next',
};

const PRIORITY: Record<DropData['type'], number> = {
    edge: 0,
    task: 1,
    list: 2,
};

function dropDataOf(collision: Collision): DropData | undefined {
    return collision.data?.droppableContainer?.data.current as
        | DropData
        | undefined;
}

/** Edge zones win over task rows, which win over the list they sit in. */
function byPriority(collisions: Collision[]): Collision[] {
    return collisions
        .filter((collision) => dropDataOf(collision) !== undefined)
        .sort(
            (a, b) =>
                PRIORITY[dropDataOf(a)!.type] - PRIORITY[dropDataOf(b)!.type],
        );
}

/**
 * Pointer drags hit-test the pointer itself, so the drop lands between the
 * rows the pointer is between. Keyboard drags (no pointer) move the overlay
 * onto a row; the drop goes below it when that row is further down than where
 * the drag started, so stepping down or up swaps places like a sortable list.
 */
const collisionDetection: CollisionDetection = (args) => {
    const pointer = args.pointerCoordinates;
    let collisions = byPriority(
        pointer ? pointerWithin(args) : rectIntersection(args),
    );

    if (collisions.length === 0 && !pointer) {
        collisions = byPriority(closestCenter(args));
    }

    const first = collisions[0];

    if (!first) {
        return [];
    }

    const rect = args.droppableRects.get(first.id);
    let below = false;

    if (rect && dropDataOf(first)?.type === 'task') {
        if (pointer) {
            below = pointer.y > rect.top + rect.height / 2;
        } else {
            const initial = args.active.rect.current.initial;
            below = initial !== null && rect.top > initial.top;
        }
    }

    return [{ ...first, data: { ...first.data, below } satisfies ProbeData }];
};

function dropTargetOf(collision: Collision | undefined): DropTarget | null {
    if (!collision) {
        return null;
    }

    const data = dropDataOf(collision);

    switch (data?.type) {
        case 'edge':
            return { type: 'edge', direction: data.direction };
        case 'list':
            return {
                type: 'list',
                placement: data.placement,
                tasks: data.tasks,
            };
        case 'task':
            return {
                type: 'task',
                placement: data.placement,
                tasks: data.tasks,
                taskId: data.task.id,
                below: Boolean((collision.data as ProbeData).below),
            };
        default:
            return null;
    }
}

const screenReaderInstructions: ScreenReaderInstructions = {
    draggable:
        'To move a task, press Space or Enter on its move button. Use the arrow keys to choose where it goes, Space or Enter to drop it, Escape to cancel.',
};

function taskOf(data: unknown): Task | undefined {
    return (data as TaskDragData | undefined)?.task;
}

function overLabel(data: unknown): string | null {
    const over = data as DropData | undefined;

    if (over === undefined) {
        return null;
    }

    if (over.type === 'edge') {
        return over.direction === -1 ? 'the previous week' : 'the next week';
    }

    return placementLabel(over.placement);
}

type PlannerDndState = {
    /** The task being dragged. */
    activeId: string | null;
    /** Where the insertion line is drawn, if anywhere. */
    indicator: DropResult['indicator'];
};

const PlannerDndStateContext = createContext<PlannerDndState>({
    activeId: null,
    indicator: null,
});

/** The drag state the task lists draw from (dimmed row, insertion line). */
export function usePlannerDnd(): PlannerDndState {
    return use(PlannerDndStateContext);
}

/**
 * A click right after a pointer drag (the button lands back where it was
 * pressed) must not open the task.
 */
function swallowNextClick(): void {
    const swallow = (event: MouseEvent) => {
        event.stopPropagation();
        event.preventDefault();
    };

    window.addEventListener('click', swallow, { capture: true, once: true });
    setTimeout(() =>
        window.removeEventListener('click', swallow, { capture: true }),
    );
}

function EdgeZone({
    direction,
    onHover,
}: {
    direction: WeekDirection;
    onHover: (direction: WeekDirection) => void;
}) {
    const { setNodeRef, isOver } = useDroppable({
        id: EDGE_IDS[direction],
        data: { type: 'edge', direction } satisfies EdgeDropData,
    });

    const hover = useEffectEvent(() => onHover(direction));

    // While hovered, flip the week every EDGE_HOVER_DELAY_MS.
    useEffect(() => {
        if (!isOver) {
            return;
        }

        const timer = setInterval(() => hover(), EDGE_HOVER_DELAY_MS);

        return () => clearInterval(timer);
    }, [isOver]);

    return (
        <div
            ref={setNodeRef}
            data-edge-zone={direction === -1 ? 'previous' : 'next'}
            aria-hidden
            className={cn(
                'pointer-events-none fixed inset-y-0 z-[5] flex w-4 items-center lg:w-6',
                direction === -1 ? 'start-0' : 'end-0',
            )}
        >
            <div
                className={cn(
                    'h-52 w-full bg-muted transition-colors',
                    direction === -1 ? 'rounded-e-3xl' : 'rounded-s-3xl',
                    isOver && 'bg-accent-foreground/20',
                )}
            />
        </div>
    );
}

type Props = {
    /** Monday of the shown week. */
    weekStart: Date;
    onPreviousWeek: () => void;
    onNextWeek: () => void;
    children: ReactNode;
};

/**
 * Drag and drop for the planner: tasks move within a day, across days, to and
 * from Someday, and to the previous / next week through the screen-edge zones
 * (start = previous, end = next, so RTL mirrors). A mouse drag starts after
 * 5px of movement, a touch drag after a long press, and the move button of a
 * row starts a keyboard drag. Drops are written with `moveTask` (local only).
 */
export function PlannerDnd({
    weekStart,
    onPreviousWeek,
    onNextWeek,
    children,
}: Props) {
    const sensors = useSensors(
        useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
        useSensor(TouchSensor, {
            activationConstraint: { delay: 250, tolerance: 5 },
        }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        }),
    );
    const [active, setActive] = useState<Task | null>(null);
    const [result, setResult] = useState<DropResult | null>(null);
    const lastTarget = useRef<DropTarget | null>(null);

    const resolve = (target: DropTarget | null) =>
        active && target ? resolveDrop(active, target, weekStart) : null;

    const handleDragStart = ({ active: dragged }: DragStartEvent) => {
        setActive(taskOf(dragged.data.current) ?? null);
        setResult(null);
        lastTarget.current = null;
    };

    const handleDragMove = ({ collisions }: DragMoveEvent) => {
        const target = dropTargetOf(collisions?.[0]);
        const next = resolve(target);
        lastTarget.current = target;

        if (
            next?.indicator?.listKey !== result?.indicator?.listKey ||
            next?.indicator?.beforeTaskId !== result?.indicator?.beforeTaskId
        ) {
            setResult(next);
        }
    };

    const reset = () => {
        setActive(null);
        setResult(null);
        lastTarget.current = null;
    };

    const handleDragEnd = ({ collisions, activatorEvent }: DragEndEvent) => {
        const target = dropTargetOf(collisions?.[0]) ?? lastTarget.current;
        const drop = resolve(target);

        if (active && drop) {
            moveTask(active.id, drop.move).catch(() =>
                toast.error('Could not move the task.'),
            );
        }

        if (!(activatorEvent instanceof KeyboardEvent)) {
            swallowNextClick();
        }

        reset();
    };

    const handleEdgeHover = (direction: WeekDirection) =>
        direction === -1 ? onPreviousWeek() : onNextWeek();

    const announcements: Announcements = {
        onDragStart: ({ active: dragged }) =>
            `Picked up task ${taskOf(dragged.data.current)?.text ?? ''}.`,
        onDragOver: ({ over }) => {
            const label = overLabel(over?.data.current);

            return label ? `Over ${label}.` : 'Not over a list.';
        },
        onDragEnd: ({ active: dragged, over }) => {
            const label = overLabel(over?.data.current);
            const text = taskOf(dragged.data.current)?.text ?? 'Task';

            return label ? `Moved ${text} to ${label}.` : `${text} not moved.`;
        },
        onDragCancel: ({ active: dragged }) =>
            `Cancelled. ${taskOf(dragged.data.current)?.text ?? 'The task'} was not moved.`,
    };

    return (
        <DndContext
            sensors={sensors}
            collisionDetection={collisionDetection}
            measuring={{
                droppable: { strategy: MeasuringStrategy.Always },
            }}
            accessibility={{ announcements, screenReaderInstructions }}
            onDragStart={handleDragStart}
            onDragMove={handleDragMove}
            onDragEnd={handleDragEnd}
            onDragCancel={reset}
        >
            <PlannerDndStateContext
                value={{
                    activeId: active?.id ?? null,
                    indicator: result?.indicator ?? null,
                }}
            >
                {children}
            </PlannerDndStateContext>
            {active && (
                <>
                    <EdgeZone direction={-1} onHover={handleEdgeHover} />
                    <EdgeZone direction={1} onHover={handleEdgeHover} />
                </>
            )}
            {/*
              Layers: edge zones (5) < overlay (10) < insertion line (11) <
              sticky mobile header (20), so the line stays visible under the
              task being dragged.
            */}
            <DragOverlay dropAnimation={null} zIndex={10}>
                {active && (
                    <div
                        data-drag-overlay
                        className="flex h-row cursor-grabbing items-center rounded-md bg-background text-sm shadow-lg ring-1 ring-border max-lg:text-base"
                    >
                        <TaskLabel task={active} />
                    </div>
                )}
            </DragOverlay>
        </DndContext>
    );
}
