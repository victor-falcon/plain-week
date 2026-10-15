import { Toaster } from '@/components/ui/sonner';
import { useFlashToast } from '@/hooks/use-flash-toast';

export function AppToaster() {
    useFlashToast();

    return <Toaster position="bottom-right" />;
}
