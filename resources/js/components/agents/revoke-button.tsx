import { router } from '@inertiajs/react';
import type { RouteDefinition } from '@/wayfinder';
import { useState } from 'react';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { t } from '@/lib/i18n';

/**
 * An outline button that asks before cutting an agent off (it stops working
 * at once and can't be undone), then sends the DELETE and shows a spinner.
 */
export function RevokeButton({
    action,
    label,
    title,
    description,
    'data-test': dataTest,
}: {
    action: RouteDefinition<'delete'>;
    /** The button and the confirm action ("Revoke", "Disconnect"). */
    label: string;
    title: string;
    description: string;
    'data-test'?: string;
}) {
    const [open, setOpen] = useState(false);
    const [processing, setProcessing] = useState(false);

    const revoke = () => {
        setProcessing(true);
        router.delete(action, {
            preserveScroll: true,
            onFinish: () => {
                setProcessing(false);
                setOpen(false);
            },
        });
    };

    return (
        <AlertDialog
            open={open}
            onOpenChange={(next) => !processing && setOpen(next)}
        >
            <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" data-test={dataTest}>
                    {label}
                </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>{title}</AlertDialogTitle>
                    <AlertDialogDescription>
                        {description}
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel disabled={processing}>
                        {t('common.cancel')}
                    </AlertDialogCancel>
                    <AlertDialogAction
                        variant="destructive"
                        disabled={processing}
                        onClick={(event) => {
                            event.preventDefault();
                            revoke();
                        }}
                        data-test={dataTest && `${dataTest}-confirm`}
                    >
                        {processing && <Spinner />}
                        {label}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
