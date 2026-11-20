import { Head, router } from '@inertiajs/react';
import { CircleAlert } from 'lucide-react';
import { useState } from 'react';
import Heading from '@/components/heading';
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
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
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
import { t } from '@/lib/i18n';
import { tRich } from '@/lib/i18n/rich';
import { formatTimeAgo } from '@/lib/settings/relative-time';
import { connect, destroy } from '@/routes/integrations/google';

type GoogleCalendarConnection = {
    email: string;
    broken: boolean;
    lastSyncedAt: string | null;
    lastError: string | null;
};

type Props = {
    googleCalendar: GoogleCalendarConnection | null;
};

function DisconnectButton({
    connection,
}: {
    connection: GoogleCalendarConnection;
}) {
    const [open, setOpen] = useState(false);
    const [processing, setProcessing] = useState(false);

    const disconnect = () => {
        setProcessing(true);
        router.delete(destroy(), {
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
                <Button variant="outline" data-test="google-disconnect">
                    {t('settings.integrations.disconnect')}
                </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>
                        {t('settings.integrations.disconnectTitle')}
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                        {connection.broken
                            ? t('settings.integrations.disconnectBroken', {
                                  email: connection.email,
                              })
                            : t('settings.integrations.disconnectDescription', {
                                  email: connection.email,
                              })}
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
                            disconnect();
                        }}
                        data-test="google-disconnect-confirm"
                    >
                        {processing && <Spinner />}
                        {t('settings.integrations.disconnect')}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}

/**
 * When the calendar last caught up with the planner, and what Google refused
 * last, if anything.
 */
function SyncState({ connection }: { connection: GoogleCalendarConnection }) {
    return (
        <CardContent className="space-y-3" data-test="google-sync-state">
            <p className="text-sm text-muted-foreground">
                {connection.lastSyncedAt === null
                    ? t('settings.integrations.waiting')
                    : tRich(
                          'settings.integrations.lastSynced',
                          {
                              when: (text) => (
                                  <time
                                      dateTime={connection.lastSyncedAt ?? ''}
                                      title={new Date(
                                          connection.lastSyncedAt ?? '',
                                      ).toLocaleString()}
                                  >
                                      {text}
                                  </time>
                              ),
                          },
                          { time: formatTimeAgo(connection.lastSyncedAt) },
                      )}
            </p>
            {connection.lastError !== null && (
                <Alert variant="destructive" data-test="google-sync-error">
                    <CircleAlert />
                    <AlertTitle>
                        {t('settings.integrations.syncProblem')}
                    </AlertTitle>
                    <AlertDescription>{connection.lastError}</AlertDescription>
                </Alert>
            )}
        </CardContent>
    );
}

function GoogleCalendarCard({
    connection,
}: {
    connection: GoogleCalendarConnection | null;
}) {
    return (
        <Card data-test="google-calendar">
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    Google Calendar
                    {connection?.broken && (
                        <Badge variant="destructive">
                            {t('settings.integrations.needsReconnecting')}
                        </Badge>
                    )}
                </CardTitle>
                <CardDescription>
                    {connection === null
                        ? t('settings.integrations.googleDescription')
                        : connection.broken
                          ? t('settings.integrations.googleBroken', {
                                email: connection.email,
                            })
                          : t('settings.integrations.googleConnected', {
                                email: connection.email,
                            })}
                </CardDescription>
            </CardHeader>
            {connection !== null && !connection.broken && (
                <SyncState connection={connection} />
            )}
            <CardFooter className="gap-2">
                {(connection === null || connection.broken) && (
                    <Button asChild>
                        <a href={connect.url()} data-test="google-connect">
                            {connection === null
                                ? t('settings.integrations.connect')
                                : t('settings.integrations.reconnect')}
                        </a>
                    </Button>
                )}
                {connection !== null && (
                    <DisconnectButton connection={connection} />
                )}
            </CardFooter>
        </Card>
    );
}

/**
 * Settings › Integrations: optional connections to other services. Each one
 * is server-side background work and is listed only when the instance has
 * its credentials.
 */
export default function Integrations({ googleCalendar }: Props) {
    return (
        <>
            <Head title={t('settings.integrations.title')} />

            <h1 className="sr-only">{t('settings.integrations.title')}</h1>

            <div className="space-y-6">
                <Heading
                    variant="small"
                    title={t('settings.integrations.title')}
                    description={t('settings.integrations.description')}
                />

                <GoogleCalendarCard connection={googleCalendar} />
            </div>
        </>
    );
}
