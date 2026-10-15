import { useEffect, useEffectEvent } from 'react';

export type PlannerShortcuts = {
    previousWeek: () => void;
    nextWeek: () => void;
    goToToday: () => void;
};

/** Open dialogs, alert dialogs and menus suspend the planner shortcuts. */
const OVERLAY_SELECTOR =
    '[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]';

function isEditable(target: EventTarget | null): boolean {
    return (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
            target.closest('input, textarea, select, [contenteditable]') !==
                null)
    );
}

/**
 * Planner keyboard shortcuts: ← / → previous / next week (mirrored in RTL)
 * and T for today. They only run when focus is not in a text field and no
 * dialog or menu is open.
 */
export function usePlannerShortcuts(shortcuts: PlannerShortcuts): void {
    const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
        if (
            event.defaultPrevented ||
            event.altKey ||
            event.ctrlKey ||
            event.metaKey ||
            isEditable(event.target) ||
            document.querySelector(OVERLAY_SELECTOR) !== null
        ) {
            return;
        }

        const rtl = document.documentElement.dir === 'rtl';
        let action: (() => void) | null = null;

        switch (event.key) {
            case 'ArrowLeft':
                action = rtl ? shortcuts.nextWeek : shortcuts.previousWeek;
                break;
            case 'ArrowRight':
                action = rtl ? shortcuts.previousWeek : shortcuts.nextWeek;
                break;
            case 't':
            case 'T':
                action = shortcuts.goToToday;
                break;
        }

        if (action !== null) {
            event.preventDefault();

            // Holding a key repeats it: one week per press is enough.
            if (!event.repeat) {
                action();
            }
        }
    });

    useEffect(() => {
        window.addEventListener('keydown', onKeyDown);

        return () => window.removeEventListener('keydown', onKeyDown);
    }, []);
}
