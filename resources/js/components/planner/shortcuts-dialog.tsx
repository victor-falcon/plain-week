import { useSyncExternalStore } from 'react';
import { focusCursorRow } from '@/components/planner/keyboard-cursor';
import { ShortcutKeys } from '@/components/planner/shortcut-keys';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { SHORTCUTS, SHORTCUT_GROUPS } from '@/lib/planner/shortcuts';
import { shortcutsDialogStore } from '@/lib/planner/shortcuts-dialog';

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
    const rtl = document.documentElement.dir === 'rtl';
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
                    if (focusCursorRow()) {
                        event.preventDefault();
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
