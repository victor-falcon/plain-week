import { KeyCaps } from '@/components/planner/shortcut-keys';
import { useKeyHints } from '@/hooks/use-key-hints';
import { keysFor } from '@/lib/planner/shortcuts';
import type { ShortcutId } from '@/lib/planner/shortcuts';
import { cn } from '@/lib/utils';

/** Key caps on a ruled row: a little smaller than the dialog's. */
const ROW_KEY_CLASS = 'h-5 min-w-5 rounded-md px-1 text-[0.6875rem]';

type Props = {
    action: ShortcutId;
    /** Every binding ("H ←") instead of the main one only ("H"). */
    all?: boolean;
    /** `row`: the smaller caps of a ruled row. */
    size?: 'default' | 'row';
    className?: string;
};

/**
 * The key that runs `action`, read from the registry, as a small key cap: a
 * hint for mouse and trackpad users. Nothing is rendered on touch devices
 * (`useKeyHints`). Decorative: hidden from screen readers, which get the
 * action's name from the control it hints. The direction is read at render,
 * like the shortcuts dialog does.
 */
export function ShortcutHint({
    action,
    all = false,
    size = 'default',
    className,
}: Props) {
    const show = useKeyHints();

    if (!show) {
        return null;
    }

    const rtl = document.documentElement.dir === 'rtl';
    const bindings = keysFor(action, rtl);

    return (
        <span
            aria-hidden
            data-shortcut-hint={action}
            className={cn('inline-flex shrink-0 items-center gap-1', className)}
        >
            {(all ? bindings : bindings.slice(0, 1)).map((sequence, index) => (
                <KeyCaps
                    key={index}
                    sequence={sequence}
                    className={size === 'row' ? ROW_KEY_CLASS : undefined}
                />
            ))}
        </span>
    );
}

/** A tooltip's text followed by the keys that do the same. */
export function HintedLabel({
    label,
    action,
    all = false,
}: {
    label: string;
    action: ShortcutId;
    all?: boolean;
}) {
    return (
        <span className="flex items-center gap-2">
            {label}
            <ShortcutHint action={action} all={all} />
        </span>
    );
}
