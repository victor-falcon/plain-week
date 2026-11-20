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
import { intlLocale, t } from '@/lib/i18n';
import { plans, portal } from '@/routes/billing';
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
        : new Intl.DateTimeFormat(intlLocale(), { dateStyle: 'long' }).format(
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
                <CardTitle>{t('settings.billing.lifetime')}</CardTitle>
                <CardDescription>
                    {lifetimeSince
                        ? t('settings.billing.lifetimeSince', {
                              date: formatDate(lifetimeSince),
                          })
                        : t('settings.billing.lifetimeDescription')}
                </CardDescription>
            </>
        );
    }

    if (subscription?.paymentFailed) {
        return (
            <>
                <CardTitle>{t('settings.billing.paymentFailed')}</CardTitle>
                <CardDescription>
                    {t('settings.billing.paymentFailedDescription')}
                </CardDescription>
            </>
        );
    }

    if (plan === 'weekly') {
        return (
            <>
                <CardTitle>{t('settings.billing.weekly')}</CardTitle>
                <CardDescription>
                    {subscription?.cancelled
                        ? t('settings.billing.cancelled', {
                              date: formatDate(subscription.endsAt),
                          })
                        : subscription?.renewsAt
                          ? t('settings.billing.renewsOn', {
                                date: formatDate(subscription.renewsAt),
                            })
                          : t('settings.billing.renewsWeekly')}
                </CardDescription>
            </>
        );
    }

    return (
        <>
            <CardTitle>{t('settings.billing.noPlan')}</CardTitle>
            <CardDescription>
                {t('settings.billing.noPlanDescription')}
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
            <Head title={t('settings.billing.title')} />

            <h1 className="sr-only">{t('settings.billing.title')}</h1>

            <div className="space-y-6">
                <Heading
                    variant="small"
                    title={t('settings.billing.title')}
                    description={t('settings.billing.description')}
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
                                <Link href={plans()}>
                                    {t('settings.billing.choosePlan')}
                                </Link>
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
                                        ? t('settings.billing.invoices')
                                        : t('settings.billing.manage')}
                                </a>
                            </Button>
                        )}
                    </CardFooter>
                </Card>

                {plan === 'weekly' && lifetimeOffer && (
                    <Card data-test="upgrade-lifetime">
                        <CardHeader>
                            <CardTitle>
                                {t('settings.billing.upgrade')}
                            </CardTitle>
                            <CardDescription>
                                {t('settings.billing.upgradeDescription')}
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
                                {t('settings.billing.upgrade')}
                            </Button>
                        </CardFooter>
                    </Card>
                )}

                <LegalLinks className="justify-start" />
            </div>
        </>
    );
}
