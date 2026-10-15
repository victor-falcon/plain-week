import { Toaster } from '@/components/ui/sonner';
import { useFlashToast } from '@/hooks/use-flash-toast';

export function AppToaster() {
    useFlashToast();

    // A modal dialog turns off pointer events on the page; toasts keep them,
    // so an "Undo" stays clickable while the task dialog is open.
    return (
        <Toaster
            position="bottom-right"
            toastOptions={{ className: 'pointer-events-auto' }}
        />
    );
}
