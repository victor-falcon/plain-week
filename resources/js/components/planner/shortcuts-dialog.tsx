import { Fragment, useSyncExternalStore } from 'react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Kbd, KbdGroup } from '@/components/ui/kbd';
import {
    SHORTCUTS,
    SHORTCUT_GROUPS,
    keyLabel,
    keyName,
    keysFor,
} from '@/lib/planner/shortcuts';
import type { KeySequence, ShortcutId } from '@/lib/planner/shortcuts';

const listeners = new Set<() => void>();
let open = false;

function setOpen(value: boolean) {
    open = value;
    listeners.forEach((listener) => listener());
}

/** Whether the shortcuts dialog is open, for `useSyncExternalStore`. */
export const shortcutsDialogStore = {
    subscribe: (listener: () => void) => {
        listeners.add(listener);

        return () => {
            listeners.delete(listener);
        };
    },
    isOpen: () => open,
    /** `?`, or "Keyboard shortcuts" in the account menu. */
    open: () => setOpen(true),
    close: () => setOpen(false),
};

function KeySequenceView({ sequence }: { sequence: KeySequence }) {
    return (
        <>
            <span className="sr-only">
                {sequence.map(keyName).join(' then ')}
            </span>
            <KbdGroup aria-hidden>
                {sequence.map((key, index) => (
                    <Kbd key={index}>{keyLabel(key)}</Kbd>
                ))}
            </KbdGroup>
        </>
    );
}

/** The keys of an action, "j or ↓", as the dialog lists them. */
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

/**
 * Every planner shortcut, by group, generated from `SHORTCUTS` (the list the
 * key handler uses). Opened with `?` or from the account menu.
 */
export function ShortcutsDialog({
    canOpenSettings,
}: {
    canOpenSettings: boolean;
}) {
    const isOpen = useSyncExternalStore(
        shortcutsDialogStore.subscribe,
        shortcutsDialogStore.isOpen,
        () => false,
    );
    const rtl =
        typeof document !== 'undefined' &&
        document.documentElement.dir === 'rtl';
    const shown = SHORTCUTS.filter(
        (shortcut) => canOpenSettings || shortcut.id !== 'general.settings',
    );

    return (
        <Dialog
            open={isOpen}
            onOpenChange={(value) => !value && shortcutsDialogStore.close()}
        >
            <DialogContent
                // Back to the keyboard cursor's row, if it is shown.
                onCloseAutoFocus={(event) => {
                    const row = document.querySelector<HTMLElement>(
                        '[data-cursor] [data-task-open], [data-cursor][data-new-task-row]',
                    );

                    if (row) {
                        event.preventDefault();
                        row.focus();
                    }
                }}
                className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-2xl"
            >
                <DialogHeader>
                    <DialogTitle>Keyboard shortcuts</DialogTitle>
                    <DialogDescription>
                        They work when you are not typing in a field. Press any
                        of them to show the cursor on a task.
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-x-8 gap-y-6 sm:grid-cols-2">
                    {SHORTCUT_GROUPS.map((group) => (
                        <section
                            key={group}
                            aria-labelledby={`shortcuts-${group}`}
                        >
                            <h3
                                id={`shortcuts-${group}`}
                                className="mb-1 text-sm font-semibold"
                            >
                                {group}
                            </h3>
                            <dl className="flex flex-col">
                                {shown
                                    .filter(
                                        (shortcut) => shortcut.group === group,
                                    )
                                    .map((shortcut) => (
                                        <div
                                            key={shortcut.id}
                                            className="flex items-center justify-between gap-4 border-b border-border py-1.5 text-sm last:border-b-0"
                                        >
                                            <dt className="text-muted-foreground">
                                                {shortcut.label}
                                            </dt>
                                            <dd>
                                                <ShortcutKeys
                                                    action={shortcut.id}
                                                    rtl={rtl}
                                                />
                                            </dd>
                                        </div>
                                    ))}
                            </dl>
                        </section>
                    ))}
                </div>
            </DialogContent>
        </Dialog>
    );
}
