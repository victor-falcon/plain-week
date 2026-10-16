import { ChevronLeft, X } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

type FloatingCardProps = {
    /** The card's heading; also names the dialog for screen readers. */
    title: ReactNode;
    /** Text under the heading; also describes the dialog. */
    description?: ReactNode;
    /**
     * Shows a close button and lets Esc dismiss the card. Without it the card
     * cannot be dismissed (e.g. the paywall).
     */
    onClose?: () => void;
    /** Shows a back button at the start of the top bar. */
    onBack?: () => void;
    /** Content between the back and close buttons (a step label, the logo, a link). */
    toolbar?: ReactNode;
    /** Shown right above the title (e.g. the logo). */
    icon?: ReactNode;
    children?: ReactNode;
    className?: string;
} & Pick<ComponentProps<typeof DialogContent>, 'onOpenAutoFocus'>;

function RoundIconButton({
    label,
    children,
    ...props
}: { label: string } & ComponentProps<typeof Button>) {
    return (
        <Button
            type="button"
            variant="secondary"
            size="icon"
            aria-label={label}
            className="rounded-full"
            {...props}
        >
            {children}
        </Button>
    );
}

/**
 * The floating card used for sign-in, sign-up and the plan choice (and the
 * landing card): a modal shadcn `Dialog` over the dimmed planner. A centered
 * 480px card from `sm` up; on phones a bottom sheet that leaves the top 48px
 * of the page visible. It is always open while mounted: render it from a page
 * and leave the page (`onClose`) to close it.
 */
export function FloatingCard({
    title,
    description,
    onClose,
    onBack,
    toolbar,
    icon,
    children,
    className,
    onOpenAutoFocus,
}: FloatingCardProps) {
    const hasTopBar = onBack !== undefined || onClose !== undefined || toolbar;

    return (
        <Dialog
            open
            onOpenChange={(open) => {
                if (!open) {
                    onClose?.();
                }
            }}
        >
            <DialogContent
                showCloseButton={false}
                onOpenAutoFocus={onOpenAutoFocus}
                // No description: tell Radix on purpose, so it does not warn.
                {...(description === undefined && {
                    'aria-describedby': undefined,
                })}
                // A stray click next to a half-filled form must not lose it.
                onInteractOutside={(event) => event.preventDefault()}
                onEscapeKeyDown={(event) => {
                    if (onClose === undefined) {
                        event.preventDefault();
                    }
                }}
                className={cn(
                    'flex flex-col gap-5 overflow-y-auto overscroll-contain bg-background text-base shadow-2xl',
                    // Phones: a bottom sheet from 48px below the top.
                    'max-sm:inset-x-0 max-sm:top-12 max-sm:bottom-0 max-sm:max-w-none max-sm:translate-0 max-sm:rounded-b-none max-sm:px-5 max-sm:pt-6 max-sm:pb-[max(1.5rem,env(safe-area-inset-bottom))] max-sm:rtl:translate-0 max-sm:data-open:slide-in-from-bottom-10 max-sm:data-open:zoom-in-100',
                    // From sm up: a centered card, scrolling inside the viewport when tall.
                    'sm:max-h-[calc(100svh-2rem)] sm:max-w-[480px] sm:rounded-[1.5rem] sm:p-8',
                    className,
                )}
            >
                {hasTopBar && (
                    <div className="flex min-h-9 items-center justify-between gap-3">
                        {onBack && (
                            <RoundIconButton label="Back" onClick={onBack}>
                                <ChevronLeft className="rtl:rotate-180" />
                            </RoundIconButton>
                        )}
                        <div className="flex min-w-0 grow items-center justify-between gap-3 text-sm text-muted-foreground">
                            {toolbar}
                        </div>
                        {onClose && (
                            <RoundIconButton
                                label="Close"
                                onClick={onClose}
                                data-test="floating-card-close"
                            >
                                <X />
                            </RoundIconButton>
                        )}
                    </div>
                )}

                {icon}

                <div className="flex flex-col gap-2">
                    <DialogTitle className="font-sans text-3xl leading-tight font-bold tracking-tight">
                        {title}
                    </DialogTitle>
                    {description && (
                        <DialogDescription className="text-[0.9375rem] text-muted-foreground">
                            {description}
                        </DialogDescription>
                    )}
                </div>

                {children}
            </DialogContent>
        </Dialog>
    );
}
