import { router } from '@inertiajs/react';
import type { ComponentProps, ReactNode } from 'react';
import InputError from '@/components/input-error';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';
import { home } from '@/routes';

/** Classes for the text inputs of the floating auth cards (44px). */
export const authInputClass = 'h-11 px-4';

/**
 * Leaves a floating auth card for the planner underneath it. It replaces the
 * card's history entry, so the browser's back button does not reopen it.
 */
export function closeToPlanner(): void {
    router.visit(home(), { replace: true });
}

/** A labelled field with its validation error. */
export function AuthField({
    id,
    label,
    error,
    aside,
    children,
}: {
    id: string;
    label: string;
    error?: string;
    /** Shown at the end of the label row (e.g. "Forgot it?"). */
    aside?: ReactNode;
    children: ReactNode;
}) {
    return (
        <div className="grid gap-2">
            <div className="flex items-center justify-between gap-2">
                <Label htmlFor={id} className="font-semibold">
                    {label}
                </Label>
                {aside}
            </div>
            {children}
            <InputError message={error} />
        </div>
    );
}

/** The card's main action: a full-width 48px pill in the foreground color. */
export function AuthSubmit({
    processing,
    children,
    className,
    ...props
}: { processing?: boolean } & ComponentProps<typeof Button>) {
    return (
        <Button
            type="submit"
            disabled={processing}
            className={cn(
                'h-12 w-full rounded-full bg-foreground text-base font-semibold text-background hover:bg-foreground/90',
                className,
            )}
            {...props}
        >
            {processing && <Spinner />}
            {children}
        </Button>
    );
}

/** A status message from the server (e.g. "A reset link has been sent"). */
export function AuthStatus({ children }: { children: ReactNode }) {
    return (
        <p
            role="status"
            className="rounded-2xl bg-muted px-4 py-3 text-sm text-foreground"
        >
            {children}
        </p>
    );
}

/** A centered line under the main action ("Already have an account? Log in"). */
export function AuthFootnote({ className, ...props }: ComponentProps<'p'>) {
    return (
        <p
            className={cn(
                'text-center text-sm text-muted-foreground',
                className,
            )}
            {...props}
        />
    );
}

/** A labelled rule between two ways of doing the same thing ("Or log in with email"). */
export function AuthSeparator({ children }: { children: ReactNode }) {
    return (
        <div className="relative">
            <div className="absolute inset-0 flex items-center">
                <Separator className="w-full" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">
                    {children}
                </span>
            </div>
        </div>
    );
}
