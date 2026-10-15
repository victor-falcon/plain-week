import { useDroppable } from '@dnd-kit/core';
import { useEffect, useEffectEvent } from 'react';
import type { EdgeDropData, WeekDirection } from '@/lib/planner/drop';
import { cn } from '@/lib/utils';

/** Hovering an edge zone this long shows the previous / next week. */
export const EDGE_HOVER_DELAY_MS = 600;

const EDGES: Record<
    WeekDirection,
    { id: string; name: string; side: string; rounding: string }
> = {
    [-1]: {
        id: 'edge:previous',
        name: 'previous',
        side: 'start-0',
        rounding: 'rounded-e-3xl',
    },
    1: {
        id: 'edge:next',
        name: 'next',
        side: 'end-0',
        rounding: 'rounded-s-3xl',
    },
};

type Props = {
    direction: WeekDirection;
    /** Called every EDGE_HOVER_DELAY_MS while a dragged task hovers the zone. */
    onHover: (direction: WeekDirection) => void;
};

/**
 * A drop zone on the start (previous week) or end (next week) screen edge,
 * shown while dragging. It is hit-tested by dnd-kit, not by DOM events, so it
 * never blocks the page; the hit strip is wider than the visible pill on touch
 * screens, where the very edge belongs to the system back gesture.
 */
export function EdgeZone({ direction, onHover }: Props) {
    const edge = EDGES[direction];
    const { setNodeRef, isOver } = useDroppable({
        id: edge.id,
        data: { type: 'edge', direction } satisfies EdgeDropData,
    });
    const hover = useEffectEvent(() => onHover(direction));

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
            data-edge-zone={edge.name}
            aria-hidden
            className={cn(
                'pointer-events-none fixed inset-y-0 z-[5] flex w-8 items-center lg:w-6',
                direction === -1 ? 'justify-start' : 'justify-end',
                edge.side,
            )}
        >
            <div
                className={cn(
                    'h-52 w-4 bg-muted transition-colors lg:w-full',
                    edge.rounding,
                    isOver && 'bg-accent-foreground/20',
                )}
            />
        </div>
    );
}
