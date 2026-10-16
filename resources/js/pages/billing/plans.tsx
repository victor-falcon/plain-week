import { Head, Link, usePoll } from '@inertiajs/react';
import { Check } from 'lucide-react';
import AppLogoIcon from '@/components/app-logo-icon';
import { LegalLinks } from '@/components/billing/legal-links';
import { LifetimePrice } from '@/components/billing/lifetime-price';
import type { Offers } from '@/components/billing/offers';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { useCheckout } from '@/hooks/use-checkout';
import { useLogout } from '@/hooks/use-logout';
import { home } from '@/routes';

type Props = {
    plans: Offers;
    processing: boolean;
};

const FEATURES = [
    'Sync across all your devices',
    'Works offline, syncs when back online',
    'Export your data anytime',
];

function Features() {
    return (
        <ul className="space-y-2 text-sm text-muted-foreground">
            {FEATURES.map((feature) => (
                <li key={feature} className="flex items-center gap-2">
                    <Check className="size-4 shrink-0 text-primary" />
                    {feature}
                </li>
            ))}
        </ul>
    );
}

/** Polls until Stripe confirms the payment; the server then redirects to the planner. */
function ProcessingNotice() {
    usePoll(2000);

    return (
        <Alert>
            <Spinner />
            <AlertTitle>Confirming your payment…</AlertTitle>
            <AlertDescription>
                This page continues on its own once Stripe confirms it.
            </AlertDescription>
        </Alert>
    );
}

/**
 * The paywall (SaaS mode): an account without a paid plan picks one here
 * before it can sync. Guests never see it.
 */
export default function Plans({ plans, processing }: Props) {
    const { start, pending } = useCheckout();
    const logOut = useLogout();

    return (
        <div className="flex min-h-svh flex-col items-center justify-center gap-8 bg-background px-4 py-10">
            <Head title="Choose a plan" />

            <div className="flex flex-col items-center gap-4 text-center">
                <Link href={home()} aria-label="Plain Week">
                    <AppLogoIcon className="size-9" />
                </Link>
                <h1 className="text-xl font-medium">Choose a plan</h1>
                <p className="max-w-md text-sm text-muted-foreground">
                    Your account syncs your week across all your devices. Pick
                    the plan that suits you.
                </p>
            </div>

            <div className="w-full max-w-2xl space-y-6">
                {processing && <ProcessingNotice />}

                <div className="grid gap-4 sm:grid-cols-2">
                    <Card data-test="plan-weekly">
                        <CardHeader>
                            <CardTitle>Weekly</CardTitle>
                            <CardDescription>Cancel anytime.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex items-baseline gap-1">
                                <span className="text-3xl font-semibold tracking-tight">
                                    {plans.weekly.price}
                                </span>
                                <span className="text-muted-foreground">
                                    / week
                                </span>
                            </div>
                            <Features />
                        </CardContent>
                        <CardFooter className="mt-auto">
                            <Button
                                variant="outline"
                                className="w-full"
                                disabled={pending !== null}
                                onClick={() => start('weekly')}
                            >
                                {pending === 'weekly' && <Spinner />}
                                Subscribe weekly
                            </Button>
                        </CardFooter>
                    </Card>

                    <Card data-test="plan-lifetime">
                        <CardHeader>
                            <CardTitle>Lifetime</CardTitle>
                            <CardDescription>
                                Pay once, sync forever.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <LifetimePrice offer={plans.lifetime} />
                            <Features />
                        </CardContent>
                        <CardFooter className="mt-auto">
                            <Button
                                className="w-full"
                                disabled={pending !== null}
                                onClick={() => start('lifetime')}
                            >
                                {pending === 'lifetime' && <Spinner />}
                                Buy lifetime
                            </Button>
                        </CardFooter>
                    </Card>
                </div>

                <p className="text-center text-xs text-muted-foreground">
                    Prices include VAT. Payments are handled by Stripe.
                </p>

                <div className="flex flex-col items-center gap-1 text-center text-sm text-muted-foreground">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={logOut}
                        data-test="logout-button"
                    >
                        Log out
                    </Button>
                    <span className="text-xs">
                        Without an account, Plain Week keeps working on this
                        device only.
                    </span>
                </div>

                <LegalLinks />
            </div>
        </div>
    );
}
