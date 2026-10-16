import { Head, usePoll } from '@inertiajs/react';
import { Lock } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { AuthFootnote, AuthSubmit } from '@/components/auth/auth-form';
import { LegalLinks } from '@/components/billing/legal-links';
import type { Offers } from '@/components/billing/offers';
import { FloatingCard } from '@/components/floating-card';
import TextLink from '@/components/text-link';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Spinner } from '@/components/ui/spinner';
import { useCheckout } from '@/hooks/use-checkout';
import { useLogout } from '@/hooks/use-logout';
import { edit as editData } from '@/routes/data';
import type { Plan } from '@/types';

type Props = {
    plans: Offers;
    processing: boolean;
};

const POLL_LIMIT_MS = 60_000;

/**
 * Polls until Stripe confirms the payment (the server then redirects to the
 * planner), for a minute at most: a delayed payment method can take days.
 */
function ProcessingNotice() {
    const { stop } = usePoll(2000);
    const [timedOut, setTimedOut] = useState(false);

    useEffect(() => {
        const timer = setTimeout(() => {
            stop();
            setTimedOut(true);
        }, POLL_LIMIT_MS);

        return () => clearTimeout(timer);
    }, [stop]);

    return timedOut ? (
        <Alert>
            <AlertTitle>Your payment is still being confirmed</AlertTitle>
            <AlertDescription>
                Some payment methods take a while. Sync starts on its own once
                it is confirmed; reload this page later to check.
            </AlertDescription>
        </Alert>
    ) : (
        <Alert>
            <Spinner />
            <AlertTitle>Confirming your payment…</AlertTitle>
            <AlertDescription>
                This page continues on its own once Stripe confirms it.
            </AlertDescription>
        </Alert>
    );
}

/** One plan as a selectable card. */
function PlanOption({
    value,
    name,
    note,
    price,
    priceNote,
    badge,
}: {
    value: Plan;
    name: string;
    note: string;
    price: string;
    /** Under the price: the regular price (struck through) or the period. */
    priceNote: ReactNode;
    badge?: string;
}) {
    const id = `plan-${value}`;

    return (
        <label
            htmlFor={id}
            data-test={id}
            className="relative flex cursor-pointer items-start gap-3 rounded-2xl border-2 border-border p-4 transition-colors hover:border-foreground/40 has-data-checked:border-foreground"
        >
            <RadioGroupItem id={id} value={value} className="mt-1 size-4.5" />
            <span className="flex grow flex-col gap-1">
                <span className="font-semibold">{name}</span>
                <span className="text-sm text-muted-foreground">{note}</span>
            </span>
            <span className="text-end">
                <span className="block text-2xl font-bold tracking-tight">
                    {price}
                </span>
                <span className="text-sm text-muted-foreground">
                    {priceNote}
                </span>
            </span>
            {badge && (
                <Badge className="absolute start-4 -top-2.5 bg-foreground text-background">
                    {badge}
                </Badge>
            )}
        </label>
    );
}

/**
 * The paywall (SaaS mode), step 2 of signing up: an account without a paid
 * plan picks one here before it can sync. A floating card over the planner
 * that cannot be dismissed: without a plan the account has nowhere else to
 * go but Checkout or logging out. Guests never see it.
 */
export default function Plans({ plans, processing }: Props) {
    const [plan, setPlan] = useState<Plan>('lifetime');
    const { start, pending } = useCheckout();
    const logOut = useLogout();
    const { lifetime, weekly } = plans;

    return (
        <>
            <Head title="Choose a plan" />

            <FloatingCard
                title="Choose your plan"
                description="Sync on every device and a backup on our server."
                // Start on the chosen plan, not on "Log out".
                onOpenAutoFocus={(event) => {
                    event.preventDefault();
                    document.getElementById(`plan-${plan}`)?.focus();
                }}
                toolbar={
                    <>
                        <span>Step 2 of 2</span>
                        <Button
                            variant="link"
                            size="sm"
                            className="h-auto px-0 text-muted-foreground"
                            onClick={logOut}
                            data-test="logout-button"
                        >
                            Log out
                        </Button>
                    </>
                }
            >
                {processing && <ProcessingNotice />}

                <RadioGroup
                    value={plan}
                    onValueChange={(value) => setPlan(value as Plan)}
                    aria-label="Plan"
                    className="gap-4 pt-1"
                >
                    <PlanOption
                        value="lifetime"
                        name="Lifetime"
                        note="Pay once, sync forever."
                        price={lifetime.price}
                        priceNote={
                            lifetime.regularPrice && (
                                <span className="line-through">
                                    <span className="sr-only">
                                        Regular price:{' '}
                                    </span>
                                    {lifetime.regularPrice}
                                </span>
                            )
                        }
                        badge={
                            lifetime.discountPercent
                                ? `Launch −${lifetime.discountPercent}%`
                                : undefined
                        }
                    />
                    <PlanOption
                        value="weekly"
                        name="Weekly"
                        note="Cancel anytime."
                        price={weekly.price}
                        priceNote="per week"
                    />
                </RadioGroup>

                <div className="flex justify-between gap-3 px-0.5 text-sm">
                    <span className="text-muted-foreground">
                        Due today, VAT included
                    </span>
                    <span className="font-bold" data-test="due-today">
                        {plan === 'lifetime' ? lifetime.price : weekly.price}
                    </span>
                </div>

                <div className="flex flex-col gap-3">
                    <AuthSubmit
                        type="button"
                        processing={pending !== null}
                        onClick={() => start(plan)}
                        data-test="checkout-button"
                    >
                        Continue to payment
                    </AuthSubmit>
                    <AuthFootnote className="flex items-center justify-center gap-1.5 text-xs">
                        <Lock className="size-3" aria-hidden />
                        Secure payment with Stripe. No trial, no hidden fees.
                    </AuthFootnote>
                </div>

                <AuthFootnote className="text-xs">
                    Not now?{' '}
                    <Button
                        variant="link"
                        className="h-auto p-0 text-xs text-muted-foreground underline"
                        onClick={logOut}
                    >
                        Keep using Plain Week on this device for free.
                    </Button>
                    <br />
                    Logging out removes this account's tasks from this device;{' '}
                    <TextLink href={editData()}>export them</TextLink> first to
                    keep a copy.
                </AuthFootnote>

                <LegalLinks />
            </FloatingCard>
        </>
    );
}
