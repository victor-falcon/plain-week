import { Link, router } from '@inertiajs/react';
import {
    CalendarPlus,
    Check,
    ChevronDown,
    CircleAlert,
    Copy,
    ShieldAlert,
} from 'lucide-react';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { toast } from 'sonner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
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
import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
    InputGroup,
    InputGroupAddon,
    InputGroupButton,
    InputGroupInput,
} from '@/components/ui/input-group';
import { Spinner } from '@/components/ui/spinner';
import { useClipboard } from '@/hooks/use-clipboard';
import { t } from '@/lib/i18n';
import type { TextKey } from '@/lib/i18n';
import { tRich } from '@/lib/i18n/rich';
import { plans } from '@/routes/billing';
import { destroy, store } from '@/routes/integrations/ics';

export type IcsFeed = { url: string };

/** The same URL with the `webcal://` scheme, which opens the calendar app. */
export function webcalUrl(url: string): string {
    return url.replace(/^https?:\/\//, 'webcal://');
}

const HOW_TO: TextKey[] = [
    'settings.integrations.ics.howToApple',
    'settings.integrations.ics.howToIcloud',
    'settings.integrations.ics.howToOutlook',
    'settings.integrations.ics.howToGoogle',
];

const planLink = (text: ReactNode) => (
    <Link
        href={plans()}
        className="font-medium text-foreground underline underline-offset-4"
    >
        {text}
    </Link>
);

/** A button that asks before a request that can't be undone (a new URL, turning it off). */
function ConfirmButton({
    label,
    title,
    description,
    run,
    variant,
    testId,
}: {
    label: string;
    title: string;
    description: string;
    run: (onFinish: () => void) => void;
    variant: 'outline' | 'ghost';
    testId: string;
}) {
    const [open, setOpen] = useState(false);
    const [processing, setProcessing] = useState(false);

    return (
        <AlertDialog
            open={open}
            onOpenChange={(next) => !processing && setOpen(next)}
        >
            <AlertDialogTrigger asChild>
                <Button variant={variant} data-test={testId}>
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
                            setProcessing(true);
                            run(() => {
                                setProcessing(false);
                                setOpen(false);
                            });
                        }}
                        data-test={`${testId}-confirm`}
                    >
                        {processing && <Spinner />}
                        {label}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}

/** The feed URL, read-only, with a button that copies it. */
function FeedUrl({ url }: { url: string }) {
    const [copiedText, copy] = useClipboard();
    const copied = copiedText === url;

    return (
        <InputGroup>
            <InputGroupInput
                readOnly
                value={url}
                dir="ltr"
                className="font-mono text-xs"
                aria-label={t('settings.integrations.ics.urlLabel')}
                onFocus={(event) => event.currentTarget.select()}
                data-test="ics-feed-url"
            />
            <InputGroupAddon align="inline-end">
                <InputGroupButton
                    onClick={async () => {
                        if (await copy(url)) {
                            toast.success(
                                t('settings.integrations.ics.copied'),
                            );
                        } else {
                            toast.error(t('settings.agents.copyFailed'));
                        }
                    }}
                    data-test="ics-feed-copy"
                >
                    {copied ? <Check /> : <Copy />}
                    {t('settings.agents.copy')}
                </InputGroupButton>
            </InputGroupAddon>
        </InputGroup>
    );
}

/** Where each calendar app takes a subscription URL, folded away until asked for. */
function HowTo() {
    return (
        <Collapsible>
            <CollapsibleTrigger asChild>
                <Button
                    variant="link"
                    size="sm"
                    className="group h-auto px-0 text-muted-foreground"
                    data-test="ics-feed-how-to"
                >
                    {t('settings.integrations.ics.howTo')}
                    <ChevronDown className="transition-transform group-data-[state=open]:rotate-180" />
                </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
                <ul className="mt-2 list-disc space-y-1 ps-5 text-sm text-muted-foreground">
                    {HOW_TO.map((key) => (
                        <li key={key}>
                            {tRich(key, {
                                b: (text) => (
                                    <span className="font-medium text-foreground">
                                        {text}
                                    </span>
                                ),
                            })}
                        </li>
                    ))}
                </ul>
            </CollapsibleContent>
        </Collapsible>
    );
}

/**
 * Settings › Integrations › Calendar feed: a private `.ics` URL that calendar
 * apps subscribe to. Server state, like the Google Calendar card: turning it
 * on, a new URL and turning it off are requests that come back with a toast.
 */
export function IcsFeedCard({
    feed,
    canEnable,
}: {
    feed: IcsFeed | null;
    /** False in SaaS mode without a plan: enabling and a new URL need one. */
    canEnable: boolean;
}) {
    const [enabling, setEnabling] = useState(false);

    const enable = () => {
        setEnabling(true);
        router.post(
            store(),
            {},
            { preserveScroll: true, onFinish: () => setEnabling(false) },
        );
    };

    return (
        <Card data-test="ics-feed">
            <CardHeader>
                <CardTitle>{t('settings.integrations.ics.title')}</CardTitle>
                <CardDescription>
                    {feed === null
                        ? t('settings.integrations.ics.description')
                        : t('settings.integrations.ics.enabled')}
                </CardDescription>
            </CardHeader>

            {feed === null ? (
                !canEnable && (
                    <CardContent>
                        <p
                            className="text-sm text-muted-foreground"
                            data-test="ics-feed-needs-plan"
                        >
                            {tRich('settings.integrations.ics.needsPlan', {
                                plan: planLink,
                            })}
                        </p>
                    </CardContent>
                )
            ) : (
                <CardContent className="space-y-4">
                    <FeedUrl url={feed.url} />
                    <Alert data-test="ics-feed-private">
                        <ShieldAlert />
                        <AlertDescription>
                            {t('settings.integrations.ics.private')}
                        </AlertDescription>
                    </Alert>
                    {!canEnable && (
                        <Alert
                            variant="destructive"
                            data-test="ics-feed-paused"
                        >
                            <CircleAlert />
                            <AlertTitle>
                                {t('settings.integrations.ics.pausedTitle')}
                            </AlertTitle>
                            <AlertDescription>
                                <p>
                                    {tRich('settings.integrations.ics.paused', {
                                        plan: planLink,
                                    })}
                                </p>
                            </AlertDescription>
                        </Alert>
                    )}
                    <HowTo />
                </CardContent>
            )}

            <CardFooter className="flex-wrap gap-2">
                {feed === null ? (
                    <Button
                        onClick={enable}
                        disabled={enabling || !canEnable}
                        data-test="ics-feed-enable"
                    >
                        {enabling && <Spinner />}
                        {t('settings.integrations.ics.enable')}
                    </Button>
                ) : (
                    <>
                        <Button asChild>
                            <a
                                href={webcalUrl(feed.url)}
                                data-test="ics-feed-open"
                            >
                                <CalendarPlus />
                                {t('settings.integrations.ics.open')}
                            </a>
                        </Button>
                        {canEnable && (
                            <ConfirmButton
                                variant="outline"
                                label={t(
                                    'settings.integrations.ics.regenerate',
                                )}
                                title={t(
                                    'settings.integrations.ics.regenerateTitle',
                                )}
                                description={t(
                                    'settings.integrations.ics.regenerateDescription',
                                )}
                                run={(onFinish) =>
                                    router.post(
                                        store(),
                                        {},
                                        { preserveScroll: true, onFinish },
                                    )
                                }
                                testId="ics-feed-regenerate"
                            />
                        )}
                        <ConfirmButton
                            variant="ghost"
                            label={t('settings.integrations.ics.disable')}
                            title={t('settings.integrations.ics.disableTitle')}
                            description={t(
                                'settings.integrations.ics.disableDescription',
                            )}
                            run={(onFinish) =>
                                router.delete(destroy(), {
                                    preserveScroll: true,
                                    onFinish,
                                })
                            }
                            testId="ics-feed-disable"
                        />
                    </>
                )}
            </CardFooter>
        </Card>
    );
}
