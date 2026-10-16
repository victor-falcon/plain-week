import { Fragment } from 'react';
import { Kbd, KbdGroup } from '@/components/ui/kbd';
import { keyLabel, keyName, keysFor } from '@/lib/planner/shortcuts';
import type { KeySequence, ShortcutId } from '@/lib/planner/shortcuts';

function KeySequenceView({ sequence }: { sequence: KeySequence }) {
    return (
        <>
            <span className="sr-only">
                {sequence.map(keyName).join(' then ')}
            </span>
            {/* Left to right even in RTL, where "<" and ">" would mirror. */}
            <KbdGroup aria-hidden dir="ltr">
                {sequence.map((key, index) => (
                    <Kbd key={index}>{keyLabel(key)}</Kbd>
                ))}
            </KbdGroup>
        </>
    );
}

/**
 * The keys that run an action in the current direction, "j or ↓", read by
 * the registry (`lib/planner/shortcuts.ts`) from its id.
 */
export function ShortcutKeys({
    action,
    rtl,
}: {
    action: ShortcutId;
    rtl: boolean;
}) {
    return (
        <span className="flex flex-wrap items-center justify-end gap-1.5">
            {keysFor(action, rtl).map((sequence, index) => (
                <Fragment key={index}>
                    {index > 0 && (
                        <span className="text-xs text-muted-foreground">
                            or
                        </span>
                    )}
                    <KeySequenceView sequence={sequence} />
                </Fragment>
            ))}
        </span>
    );
}
