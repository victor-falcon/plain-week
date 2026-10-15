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
import { createContext, use, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { toast } from 'sonner';
import { EdgeZone } from '@/components/planner/edge-zone';
import { TaskLabel } from '@/components/planner/task-row';
import { moveTask } from '@/lib/db/tasks';
import type { MoveTaskInput } from '@/lib/db/tasks';
import {
    originalSpot,
    placementKey,
    placementLabel,
    resolveDrop,
} from '@/lib/planner/drop';
import type {
    DropData,
    DropResult,
    DropTarget,
    TaskDragData,
    WeekDirection,
} from '@/lib/planner/drop';

/** A mouse drag starts after this much movement, so a click still opens. */
const MOUSE_DRAG_DISTANCE_PX = 5;

/** A touch drag starts after a long press; moving earlier scrolls instead. */
const TOUCH_DRAG_DELAY_MS = 250;
const TOUCH_DRAG_TOLERANCE_PX = 5;

export function listDroppableId(listKey: string): string {
    return `list:${listKey}`;
}

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

/** Whether the drop goes below the task row hit, carried on the collision. */
function isBelow(collision: Collision): boolean {
    return (collision.data as { below?: boolean }).below === true;
}

/**
 * Pointer drags hit-test the pointer itself, so the drop lands between the
 * rows the pointer is between. Keyboard drags (no pointer) move the overlay
 * onto a row: within the task's own list it lands below the row when that row
 * is further down than where the drag started (stepping swaps places like a
 * sortable list); in another list it lands above it.
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
    const data = first && dropDataOf(first);

    if (!first || !data) {
        return [];
    }

    const rect = args.droppableRects.get(first.id);
    let below = false;

    if (rect && data.type === 'task') {
        if (pointer) {
            below = pointer.y > rect.top + rect.height / 2;
        } else {
            // Empty once the source row has unmounted (week changed).
            const placement = (
                args.active.data.current as Partial<TaskDragData> | undefined
            )?.placement;
            const initial = args.active.rect.current.initial;
            below =
                placement !== undefined &&
                initial !== null &&
                placementKey(placement) === placementKey(data.placement) &&
                rect.top > initial.top;
        }
    }

    return [{ ...first, data: { ...first.data, below } }];
};

function dropTargetOf(collision: Collision | undefined): DropTarget | null {
    const data = collision && dropDataOf(collision);

    if (!collision || !data) {
        return null;
    }

    switch (data.type) {
        case 'edge':
            return data;
        case 'list':
            return data;
        case 'task':
            return {
                type: 'task',
                placement: data.placement,
                tasks: data.tasks,
                taskId: data.task.id,
                below: isBelow(collision),
            };
    }
}

const screenReaderInstructions: ScreenReaderInstructions = {
    draggable:
        'To move a task, press Space or Enter on its move button. Use the arrow keys to choose where it goes, Space or Enter to drop it, Escape to cancel.',
};

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
    /** The task being dragged, or just dropped and still being written. */
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
 * The click that follows a pointer drag (the release over the button it was
 * pressed on, also after Escape cancelled the drag) must not open the task.
 * If no click comes, the next press or key disarms it.
 */
function swallowNextClick(): void {
    const options = { capture: true };
    const swallow = (event: MouseEvent) => {
        event.stopPropagation();
        event.preventDefault();
        disarm();
    };
    const disarm = () => {
        window.removeEventListener('click', swallow, options);
        window.removeEventListener('pointerdown', disarm, options);
        window.removeEventListener('keydown', disarm, options);
    };

    window.addEventListener('click', swallow, options);
    window.addEventListener('pointerdown', disarm, options);
    window.addEventListener('keydown', disarm, options);
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
 *
 * Rows use `@dnd-kit/sortable` for its keyboard coordinates and item
 * registration, but are not shifted with its transforms: an insertion line
 * shows where the task will land instead, since a task can also leave the
 * list (or the week).
 */
export function PlannerDnd({
    weekStart,
    onPreviousWeek,
    onNextWeek,
    children,
}: Props) {
    const sensors = useSensors(
        useSensor(MouseSensor, {
            activationConstraint: { distance: MOUSE_DRAG_DISTANCE_PX },
        }),
        useSensor(TouchSensor, {
            activationConstraint: {
                delay: TOUCH_DRAG_DELAY_MS,
                tolerance: TOUCH_DRAG_TOLERANCE_PX,
            },
        }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        }),
    );
    // The drag data is kept in state: the source row unmounts when hovering
    // an edge zone changes the shown week, and the drag goes on.
    const [dragged, setDragged] = useState<TaskDragData | null>(null);
    const [result, setResult] = useState<DropResult | null>(null);
    // A dropped task stays dimmed until its write lands, so the row does not
    // flash back in its old place for a frame.
    const [settlingId, setSettlingId] = useState<string | null>(null);
    const lastResult = useRef<DropResult | null>(null);
    const draggedText = useRef('');

    const resolve = (target: DropTarget | null) =>
        dragged && target ? resolveDrop(dragged.task, target, weekStart) : null;

    const handleDragStart = ({ active }: DragStartEvent) => {
        setDragged((active.data.current as TaskDragData | undefined) ?? null);
        setResult(null);
        lastResult.current = null;
    };

    const handleDragMove = ({ collisions }: DragMoveEvent) => {
        const next = resolve(dropTargetOf(collisions?.[0]));
        lastResult.current = next;

        if (
            next?.indicator?.listKey !== result?.indicator?.listKey ||
            next?.indicator?.beforeTaskId !== result?.indicator?.beforeTaskId
        ) {
            setResult(next);
        }
    };

    const finish = (activatorEvent: Event) => {
        if (!(activatorEvent instanceof KeyboardEvent)) {
            swallowNextClick();
        }

        setDragged(null);
        setResult(null);
    };

    const write = (id: string, move: MoveTaskInput) => {
        setSettlingId(id);

        return moveTask(id, move)
            .catch((error: unknown) => {
                toast.error('Could not move the task.');
                throw error;
            })
            .finally(() =>
                requestAnimationFrame(() =>
                    setSettlingId((current) =>
                        current === id ? null : current,
                    ),
                ),
            );
    };

    const handleDragEnd = ({ collisions, activatorEvent }: DragEndEvent) => {
        // Released outside every list and edge zone: nothing moves.
        const drop = resolve(dropTargetOf(collisions?.[0]));
        lastResult.current = drop;

        if (dragged && drop) {
            const { task } = dragged;
            const undo = originalSpot(task, dragged);

            write(task.id, drop.move)
                .then(() => {
                    // The task left the screen: say where it went.
                    if (drop.indicator === null) {
                        toast(`Moved to ${placementLabel(drop.move)}.`, {
                            action: {
                                label: 'Undo',
                                onClick: () => void write(task.id, undo),
                            },
                        });
                    }
                })
                .catch(() => {});
        }

        finish(activatorEvent);
    };

    const handleDragCancel = ({
        activatorEvent,
    }: {
        activatorEvent: Event;
    }) => {
        lastResult.current = null;
        finish(activatorEvent);
    };

    const handleEdgeHover = (direction: WeekDirection) =>
        direction === -1 ? onPreviousWeek() : onNextWeek();

    // Announcements read the drag data from the event, which loses it when the
    // source row unmounts mid-drag; keep the text from the start.
    const textOf = (data: unknown) => {
        const text = (data as Partial<TaskDragData> | undefined)?.task?.text;

        if (text !== undefined) {
            draggedText.current = text;
        }

        return draggedText.current;
    };

    const announcements: Announcements = {
        onDragStart: ({ active }) =>
            `Picked up task ${textOf(active.data.current)}.`,
        onDragOver: ({ over }) => {
            const label = overLabel(over?.data.current);

            return label ? `Over ${label}.` : 'Not over a list.';
        },
        onDragEnd: ({ active }) => {
            const drop = lastResult.current;
            const text = textOf(active.data.current);

            return drop
                ? `Moved ${text} to ${placementLabel(drop.move)}.`
                : `${text} was not moved.`;
        },
        onDragCancel: ({ active }) =>
            `Cancelled. ${textOf(active.data.current)} was not moved.`,
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
            onDragCancel={handleDragCancel}
        >
            <PlannerDndStateContext
                value={{
                    activeId: dragged?.task.id ?? settlingId,
                    indicator: result?.indicator ?? null,
                }}
            >
                {children}
            </PlannerDndStateContext>
            {dragged && (
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
                {dragged && (
                    <div
                        data-drag-overlay
                        className="flex h-row cursor-grabbing items-center rounded-md bg-background text-sm shadow-lg ring-1 ring-border max-lg:text-base"
                    >
                        <TaskLabel task={dragged.task} />
                    </div>
                )}
            </DragOverlay>
        </DndContext>
    );
}
