import { Head, Link } from '@inertiajs/react';
import { LegalLinks } from '@/components/billing/legal-links';
import { LifetimePrice } from '@/components/billing/lifetime-price';
import type { LifetimeOffer } from '@/components/billing/offers';
import Heading from '@/components/heading';
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
import { edit as editBilling, plans, portal } from '@/routes/billing';
import type { Plan } from '@/types';

type Props = {
    plan: Plan | null;
    lifetimeSince: string | null;
    subscription: {
        paymentFailed: boolean;
        cancelled: boolean;
        endsAt: string | null;
        renewsAt: string | null;
    } | null;
    hasStripeCustomer: boolean;
    lifetimeOffer: LifetimeOffer | null;
};

function formatDate(iso: string | null): string {
    return iso === null
        ? ''
        : new Intl.DateTimeFormat(undefined, { dateStyle: 'long' }).format(
              new Date(iso),
          );
}

function CurrentPlan({
    plan,
    lifetimeSince,
    subscription,
}: Pick<Props, 'plan' | 'lifetimeSince' | 'subscription'>) {
    if (plan === 'lifetime') {
        return (
            <>
                <CardTitle>Lifetime</CardTitle>
                <CardDescription>
                    {lifetimeSince
                        ? `Yours since ${formatDate(lifetimeSince)}. Sync is included for good.`
                        : 'Sync is included for good.'}
                </CardDescription>
            </>
        );
    }

    if (subscription?.paymentFailed) {
        return (
            <>
                <CardTitle>Weekly: payment failed</CardTitle>
                <CardDescription>
                    Update your payment method to keep syncing. Your tasks stay
                    on this device meanwhile.
                </CardDescription>
            </>
        );
    }

    if (plan === 'weekly') {
        return (
            <>
                <CardTitle>Weekly</CardTitle>
                <CardDescription>
                    {subscription?.cancelled
                        ? `Cancelled. Sync keeps working until ${formatDate(subscription.endsAt)}.`
                        : subscription?.renewsAt
                          ? `Renews on ${formatDate(subscription.renewsAt)}.`
                          : 'Renews every week.'}
                </CardDescription>
            </>
        );
    }

    return (
        <>
            <CardTitle>No plan</CardTitle>
            <CardDescription>
                Choose a plan to sync your tasks across your devices.
            </CardDescription>
        </>
    );
}

/** Settings › Billing (SaaS mode only). */
export default function Billing({
    plan,
    lifetimeSince,
    subscription,
    hasStripeCustomer,
    lifetimeOffer,
}: Props) {
    const { start, pending } = useCheckout();

    return (
        <>
            <Head title="Billing" />

            <h1 className="sr-only">Billing</h1>

            <div className="space-y-6">
                <Heading
                    variant="small"
                    title="Billing"
                    description="Your plan, payment method and invoices"
                />

                <Card data-test="current-plan">
                    <CardHeader>
                        <CurrentPlan
                            plan={plan}
                            lifetimeSince={lifetimeSince}
                            subscription={subscription}
                        />
                    </CardHeader>
                    <CardFooter className="gap-2">
                        {plan === null && subscription === null && (
                            <Button asChild>
                                <Link href={plans()}>Choose a plan</Link>
                            </Button>
                        )}
                        {hasStripeCustomer && (
                            <Button
                                variant={
                                    subscription?.paymentFailed
                                        ? 'default'
                                        : 'outline'
                                }
                                asChild
                            >
                                <a href={portal.url()}>
                                    {subscription === null
                                        ? 'Invoices'
                                        : 'Manage subscription'}
                                </a>
                            </Button>
                        )}
                    </CardFooter>
                </Card>

                {plan === 'weekly' && lifetimeOffer && (
                    <Card data-test="upgrade-lifetime">
                        <CardHeader>
                            <CardTitle>Upgrade to lifetime</CardTitle>
                            <CardDescription>
                                Pay once and stop paying every week. Your weekly
                                subscription ends with the period you already
                                paid for.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <LifetimePrice offer={lifetimeOffer} />
                        </CardContent>
                        <CardFooter>
                            <Button
                                disabled={pending !== null}
                                onClick={() => start('lifetime')}
                            >
                                {pending === 'lifetime' && <Spinner />}
                                Upgrade to lifetime
                            </Button>
                        </CardFooter>
                    </Card>
                )}

                <LegalLinks className="justify-start" />
            </div>
        </>
    );
}

Billing.layout = {
    breadcrumbs: [
        {
            title: 'Billing',
            href: editBilling(),
        },
    ],
};
