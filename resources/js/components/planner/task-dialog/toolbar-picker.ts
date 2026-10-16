import { createContext, use } from 'react';
import type { Dispatch, SetStateAction } from 'react';

/** The toolbar's popovers and menu; one is open at a time. */
export type ToolbarPicker = 'date' | 'time' | 'repeat' | 'color' | 'more';

type ToolbarPickerState = {
    open: ToolbarPicker | null;
    setOpen: Dispatch<SetStateAction<ToolbarPicker | null>>;
};

/**
 * Which toolbar popover is open, held by the dialog so its shortcuts
 * (`d`, `t`, `r`, `c`, `m`) can open them.
 */
export const ToolbarPickerContext = createContext<ToolbarPickerState | null>(
    null,
);

/** The `open` / `onOpenChange` pair of one toolbar popover or menu. */
export function useToolbarPicker(picker: ToolbarPicker): {
    open: boolean;
    onOpenChange: (open: boolean) => void;
} {
    const state = use(ToolbarPickerContext);

    if (!state) {
        throw new Error('useToolbarPicker needs the task dialog.');
    }

    return {
        open: state.open === picker,
        // Closing leaves another picker alone: a menu trigger opens on
        // pointer down, before the open popover hears the outside press.
        onOpenChange: (open) =>
            state.setOpen((current) =>
                open ? picker : current === picker ? null : current,
            ),
    };
}
