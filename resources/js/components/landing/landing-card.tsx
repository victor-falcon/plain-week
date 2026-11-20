import { Link, usePage } from '@inertiajs/react';
import { Check, Code, Copy } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import AppLogoIcon from '@/components/app-logo-icon';
import { lifetimeBadge } from '@/components/billing/offers';
import type {
    FeaturedCode,
    Offers,
    SoldOutCode,
} from '@/components/billing/offers';
import { FloatingCard } from '@/components/floating-card';
import { AgentPrompts } from '@/components/mcp-announcement/agent-prompts';
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { usePlanPrices } from '@/hooks/use-plan-prices';
import { landingStore, rememberChosenPlan } from '@/lib/landing';
import { REPOSITORY_URL } from '@/lib/project';
import { cn } from '@/lib/utils';
import { login, register } from '@/routes';
import { privacy, terms } from '@/routes/legal';
import type { Plan } from '@/types';
import { t } from '@/lib/i18n';

const SELF_HOSTING_URL = `${REPOSITORY_URL}/blob/main/docs/self-hosting.md`;
const CHANGELOG_URL = `${REPOSITORY_URL}/blob/main/CHANGELOG.md`;

function reasons() {
    return [
        {
            title: t('landing.reasonWeekTitle'),
            text: t('landing.reasonWeekText'),
        },
        {
            title: t('landing.reasonInstantTitle'),
            text: t('landing.reasonInstantText'),
        },
        {
            title: t('landing.reasonRepeatsTitle'),
            text: t('landing.reasonRepeatsText'),
        },
        {
            title: t('landing.reasonTypeTitle'),
            text: t('landing.reasonTypeText'),
        },
    ];
}

function questions() {
    return [
        {
            question: t('landing.questionAccount'),
            answer: t('landing.answerAccount'),
        },
        {
            question: t('landing.questionPay'),
            answer: t('landing.answerPay'),
        },
        {
            question: t('landing.questionCancel'),
            answer: t('landing.answerCancel'),
        },
        {
            question: t('landing.questionData'),
            answer: t('landing.answerData'),
        },
        {
            question: t('landing.questionAgents'),
            answer: t('landing.answerAgents'),
            mcp: true,
        },
        {
            question: t('landing.questionTrial'),
            answer: t('landing.answerTrial'),
        },
    ];
}

const pill = 'h-12 rounded-full text-base font-semibold';
const solidPill = 'bg-foreground text-background hover:bg-foreground/90';
const outlinePill =
    'border-2 border-foreground bg-background text-foreground hover:bg-muted dark:bg-background';

function ExternalLink({
    href,
    className,
    children,
}: {
    href: string;
    className?: string;
    children: ReactNode;
}) {
    return (
        <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className={cn('underline-offset-4 hover:underline', className)}
        >
            {children}
        </a>
    );
}

/** Desktop week and phone screenshots, matching the current theme. */
function ProductShots() {
    const shot = (name: string, theme: 'light' | 'dark', className: string) => (
        <img
            src={`/images/landing/${name}-${theme}.webp`}
            alt=""
            loading="lazy"
            decoding="async"
            className={cn(
                theme === 'light' ? 'dark:hidden' : 'hidden dark:block',
                className,
            )}
        />
    );
    const desktop =
        'absolute start-5 top-6 w-[150%] max-w-none rounded-xl shadow-lg ring-1 ring-border';
    const phone =
        'absolute end-5 -bottom-10 w-[34%] rounded-[1.25rem] border-4 border-foreground shadow-xl';

    return (
        <figure
            className="relative h-60 shrink-0 overflow-hidden rounded-[1.125rem] bg-muted sm:h-75"
            aria-label={t('landing.productShotsLabel')}
        >
            {shot('desktop', 'light', desktop)}
            {shot('desktop', 'dark', desktop)}
            {shot('mobile', 'light', phone)}
            {shot('mobile', 'dark', phone)}
        </figure>
    );
}

/** The MCP connector: AI agents that read and change the planner. */
function AgentBlock() {
    return (
        <section
            className="flex flex-col gap-4 rounded-2xl border-[1.5px] border-border p-5"
            data-test="landing-agents"
        >
            <div className="flex flex-col gap-2">
                <Badge className="self-start bg-foreground text-background">
                    {t('announcement.badge')}
                </Badge>
                <SectionTitle>{t('announcement.title')}</SectionTitle>
                <p className="text-sm leading-normal text-muted-foreground">
                    {t('announcement.description')}
                </p>
            </div>
            <AgentPrompts />
            <p className="text-[0.8125rem] leading-normal text-muted-foreground">
                {t('landing.agentsNote')}
            </p>
        </section>
    );
}

function SectionTitle({ children }: { children: ReactNode }) {
    return <h3 className="text-2xl font-bold tracking-tight">{children}</h3>;
}

function WhyItWorks() {
    return (
        <section className="flex flex-col gap-4.5 pt-2">
            <SectionTitle>{t('landing.whyItWorks')}</SectionTitle>
            <ul className="grid gap-5 sm:grid-cols-2">
                {reasons().map(({ title, text }) => (
                    <li key={title} className="flex flex-col gap-1.5">
                        <span className="font-semibold">{title}</span>
                        <span className="text-sm leading-normal text-muted-foreground">
                            {text}
                        </span>
                    </li>
                ))}
            </ul>
        </section>
    );
}

/** The featured code as a button that copies it. */
function CopyCode({ code }: { code: string }) {
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        if (!copied) {
            return;
        }

        const timer = setTimeout(() => setCopied(false), 2000);

        return () => clearTimeout(timer);
    }, [copied]);

    return (
        <>
            <Button
                type="button"
                variant="outline"
                size="xs"
                className="font-mono tracking-wide"
                aria-label={t('landing.copyCode', { code })}
                onClick={() => {
                    navigator.clipboard
                        ?.writeText(code)
                        .then(() => setCopied(true))
                        .catch(() => {
                            // The code stays readable on the button.
                        });
                }}
                data-test="featured-code"
            >
                {code}
                {copied ? (
                    <Check data-icon="inline-end" aria-hidden />
                ) : (
                    <Copy data-icon="inline-end" aria-hidden />
                )}
            </Button>
            <span role="status" className="sr-only">
                {copied && t('landing.codeCopied')}
            </span>
        </>
    );
}

/** Under a plan's note: the featured code and what it gives. */
function FeaturedCodeLine({ featured }: { featured: FeaturedCode }) {
    return (
        <p
            className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm"
            data-test="featured-code-line"
        >
            {featured.free
                ? t('landing.useCode')
                : t('landing.priceWithCode', { price: featured.price })}{' '}
            <CopyCode code={featured.code} />
        </p>
    );
}

/** Under the featured code: a code that has run out, struck through, never usable. */
function SoldOutLine({ soldOut }: { soldOut: SoldOutCode }) {
    return (
        <div
            className="flex flex-col gap-1 border-t border-dashed pt-2.5 text-[0.8125rem] text-muted-foreground"
            data-test="sold-out-code"
        >
            <span className="flex items-center gap-1.5 whitespace-nowrap">
                <span className="font-mono text-xs tracking-wide line-through">
                    {soldOut.code}
                </span>
                <Badge variant="secondary" className="text-muted-foreground">
                    {t('landing.soldOut')}
                </Badge>
            </span>
            <span>{t('landing.freeForFounders')}</span>
        </div>
    );
}

function PlanCard({
    plan,
    name,
    price,
    priceNote,
    note,
    action,
    badge,
    featured,
    soldOut,
}: {
    plan: Plan;
    name: string;
    /** Null while loading, undefined when unavailable. */
    price: string | null | undefined;
    priceNote: ReactNode;
    note: string;
    action: string;
    badge?: string;
    /** The featured code, when it is for this plan. */
    featured?: FeaturedCode;
    /** A code that has run out, shown after the featured one. */
    soldOut?: SoldOutCode;
}) {
    const highlighted = plan === 'lifetime';
    // Sign-up closed (REGISTRATION_ENABLED=false): the plans are shown without a way in.
    const { canRegister } = usePage().props;

    return (
        <div
            data-test={`landing-plan-${plan}`}
            className={cn(
                'relative flex flex-col gap-2.5 rounded-2xl p-5',
                highlighted
                    ? 'border-2 border-foreground'
                    : 'border-[1.5px] border-border',
            )}
        >
            {badge && (
                <Badge className="absolute end-4 -top-3 bg-foreground text-background">
                    {badge}
                </Badge>
            )}
            <span className="font-semibold">{name}</span>
            <div className="flex min-h-10 flex-wrap items-baseline gap-x-2 gap-y-1">
                {price === null && <Skeleton className="h-8 w-20" />}
                {price === undefined && (
                    <span className="text-sm text-muted-foreground">
                        {t('landing.priceShownAtSignUp')}
                    </span>
                )}
                {price && (
                    <>
                        <span className="text-3xl font-bold tracking-tight">
                            {price}
                        </span>
                        {priceNote}
                    </>
                )}
            </div>
            <span className="text-[0.8125rem] leading-normal text-muted-foreground">
                {note}
            </span>
            {featured && <FeaturedCodeLine featured={featured} />}
            {soldOut && <SoldOutLine soldOut={soldOut} />}
            {canRegister && (
                <Button
                    asChild
                    className={cn(
                        pill,
                        'mt-auto h-11',
                        highlighted ? solidPill : outlinePill,
                    )}
                >
                    <Link
                        href={register()}
                        onClick={() => rememberChosenPlan(plan)}
                    >
                        {action}
                    </Link>
                </Button>
            )}
        </div>
    );
}

/** A price struck through, read out as `label`. */
function StruckPrice({ label, price }: { label: string; price: string }) {
    return (
        <span className="text-muted-foreground line-through">
            <span className="sr-only">{label} </span>
            {price}
        </span>
    );
}

function Pricing({ offers }: { offers: Offers | null | 'unavailable' }) {
    const known = offers === 'unavailable' ? undefined : offers;
    const loading = known === null;
    const lifetime = known?.lifetime;
    const code = known?.featured ?? undefined;
    const weeklyCode = code?.plan === 'weekly' ? code : undefined;
    const lifetimeCode = code?.plan === 'lifetime' ? code : undefined;
    // The code replaces the launch discount, so it is compared to the regular price.
    const lifetimeWithoutCode = lifetime?.regularPrice ?? lifetime?.price;

    return (
        <section className="flex flex-col gap-4 pt-2">
            <div className="flex flex-col gap-2">
                <SectionTitle>{t('landing.syncTitle')}</SectionTitle>
                <p className="text-sm text-muted-foreground">
                    {t('landing.syncDescription')}
                </p>
            </div>
            <div className="grid gap-4 pt-1 sm:grid-cols-2 sm:gap-3">
                <PlanCard
                    plan="weekly"
                    name={t('billing.weekly')}
                    price={
                        loading
                            ? null
                            : (weeklyCode?.price ?? known?.weekly.price)
                    }
                    priceNote={
                        weeklyCode && known ? (
                            <StruckPrice
                                label={t('billing.withoutTheCode')}
                                price={known.weekly.price}
                            />
                        ) : (
                            <span className="text-sm text-muted-foreground">
                                {t('landing.perWeekShort')}
                            </span>
                        )
                    }
                    note={t('billing.weeklyNote')}
                    action={t('landing.chooseWeekly')}
                    featured={weeklyCode}
                />
                <PlanCard
                    plan="lifetime"
                    name={t('billing.lifetime')}
                    price={
                        loading
                            ? null
                            : (lifetimeCode?.price ?? lifetime?.price)
                    }
                    priceNote={
                        lifetimeCode && lifetimeWithoutCode ? (
                            <StruckPrice
                                label={t('billing.withoutTheCode')}
                                price={lifetimeWithoutCode}
                            />
                        ) : (
                            lifetime?.regularPrice && (
                                <StruckPrice
                                    label={t('billing.regularPrice')}
                                    price={lifetime.regularPrice}
                                />
                            )
                        )
                    }
                    note={
                        lifetimeCode?.free
                            ? t('landing.freeForFoundersSynced')
                            : t('billing.lifetimeNote')
                    }
                    action={t('landing.getLifetime')}
                    badge={known ? lifetimeBadge(known) : undefined}
                    featured={lifetimeCode}
                    soldOut={known?.soldOut ?? undefined}
                />
            </div>
            <p className="text-xs text-muted-foreground">
                {t('landing.pricesIncludeVat')}
            </p>
        </section>
    );
}

/** Always dark, whatever the theme, like the design's self-hosting block. */
function SelfHosting() {
    return (
        <section
            id="self-hosting"
            className="dark flex flex-col gap-3 rounded-2xl bg-background p-5 text-foreground ring-1 ring-border"
        >
            <h3 className="text-xl font-bold tracking-tight">
                {t('landing.selfHostTitle')}
            </h3>
            <p className="text-sm leading-normal text-muted-foreground">
                {t('landing.selfHostDescription')}
            </p>
            <ExternalLink
                href={SELF_HOSTING_URL}
                className="self-start text-sm font-semibold"
            >
                {t('landing.selfHostGuide')}{' '}
                <span aria-hidden className="inline-block rtl:rotate-180">
                    →
                </span>
            </ExternalLink>
        </section>
    );
}

function Questions({ mcp }: { mcp: boolean }) {
    return (
        <section className="flex flex-col gap-2">
            <SectionTitle>{t('landing.questions')}</SectionTitle>
            <Accordion
                type="single"
                collapsible
                className="rounded-none border-0"
            >
                {questions()
                    .filter((item) => mcp || !item.mcp)
                    .map(({ question, answer }) => (
                        <AccordionItem
                            key={question}
                            value={question}
                            className="border-b last:border-b data-open:bg-transparent"
                        >
                            <AccordionTrigger className="px-0 py-3.5 text-[0.9375rem] font-semibold hover:no-underline">
                                {question}
                            </AccordionTrigger>
                            <AccordionContent className="px-0 pb-3.5 text-sm leading-normal text-muted-foreground">
                                {answer}
                            </AccordionContent>
                        </AccordionItem>
                    ))}
            </Accordion>
        </section>
    );
}

function Footer() {
    const link = 'text-muted-foreground underline-offset-4 hover:underline';

    return (
        <footer className="flex flex-wrap gap-x-4 gap-y-2 pt-2 text-[0.8125rem] text-muted-foreground">
            <Link href={terms()} className={link}>
                {t('landing.terms')}
            </Link>
            <Link href={privacy()} className={link}>
                {t('landing.privacy')}
            </Link>
            <ExternalLink href={REPOSITORY_URL} className={link}>
                GitHub
            </ExternalLink>
            <ExternalLink href={CHANGELOG_URL} className={link}>
                {t('landing.changelog')}
            </ExternalLink>
            <span className="ms-auto">
                {t('landing.copyright', { year: new Date().getFullYear() })}
            </span>
        </footer>
    );
}

/**
 * The landing card (SaaS mode, guests): what Plain Week is, the prices and
 * the way to self-host it (and, while the instance has the MCP server on, the
 * AI agent block and its FAQ item), floating over the guest planner on a first visit.
 * "Start now" (or Esc) closes it for good on this device; "Log in" and the
 * plan buttons open their cards, and a plan picked here is preselected on the
 * plan choice after signing up.
 */
export function LandingCard() {
    const mcp = usePage().props.mcp?.enabled ?? false;
    const offers = usePlanPrices();
    const startButton = useRef<HTMLButtonElement>(null);

    return (
        <FloatingCard
            title={t('landing.title')}
            description={t('landing.description')}
            onClose={landingStore.dismiss}
            hideCloseButton
            // Start on the main action, not on the "Open source" link.
            onOpenAutoFocus={(event) => {
                event.preventDefault();
                startButton.current?.focus();
            }}
            toolbar={
                <>
                    <span className="flex items-center gap-2.5 text-foreground">
                        <AppLogoIcon className="size-10 shrink-0" aria-hidden />
                        <span className="font-heading text-xl font-extrabold tracking-tight">
                            Plain Week
                        </span>
                    </span>
                    <ExternalLink
                        href={REPOSITORY_URL}
                        className="flex items-center gap-1.5 font-medium text-foreground"
                    >
                        <Code className="size-4" aria-hidden />
                        {t('landing.openSource')}
                    </ExternalLink>
                </>
            }
            className="gap-6 sm:max-w-[520px] sm:p-9"
            titleClassName="text-[2.125rem] leading-[1.06] tracking-[-0.04em] sm:text-[2.75rem] sm:leading-[1.05]"
            descriptionClassName="border-t pt-5 text-base leading-normal text-foreground/80 sm:pt-6 sm:text-lg"
        >
            <div className="flex flex-col gap-3.5">
                <div className="grid grid-cols-2 gap-3">
                    <Button asChild className={cn(pill, outlinePill)}>
                        <Link href={login()} data-test="landing-login">
                            {t('auth.logIn')}
                        </Link>
                    </Button>
                    <Button
                        ref={startButton}
                        className={cn(pill, solidPill)}
                        onClick={landingStore.dismiss}
                        data-test="landing-start"
                    >
                        {t('landing.startNow')}
                    </Button>
                </div>
                <p className="text-center text-[0.8125rem] text-muted-foreground">
                    {t('landing.freeInBrowser')}
                    <span className="max-sm:hidden">
                        {' '}
                        {t('landing.syncIsPaid')}
                    </span>
                </p>
            </div>

            <ProductShots />
            {mcp && <AgentBlock />}
            <WhyItWorks />
            <Pricing offers={offers} />
            <SelfHosting />
            <Questions mcp={mcp} />
            <Footer />
        </FloatingCard>
    );
}
