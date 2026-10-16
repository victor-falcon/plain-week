import { ShortcutHint } from '@/components/planner/shortcut-hint';
import { Button } from '@/components/ui/button';
import { useKeyHints } from '@/hooks/use-key-hints';
import { shortcutsDialogStore } from '@/lib/planner/shortcuts-dialog';

/**
 * "? Keyboard shortcuts" at the end of the planner, for mouse and trackpad
 * users only (touch devices have no keyboard to use them with). A quiet way
 * in besides `?` and the account menu.
 */
export function ShortcutsButton() {
    const show = useKeyHints();

    if (!show) {
        return null;
    }

    return (
        <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={shortcutsDialogStore.open}
            className="self-end text-muted-foreground"
        >
            <ShortcutHint action="general.help" />
            Keyboard shortcuts
        </Button>
    );
}
