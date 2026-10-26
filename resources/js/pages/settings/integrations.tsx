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
import { formatTimeAgo } from '@/lib/settings/relative-time';
import { edit as editIntegrations } from '@/routes/integrations';
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
                    Disconnect
                </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>
                        Disconnect Google Calendar?
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                        {connection.broken
                            ? `Plain Week can no longer reach ${connection.email}, so its “Plain Week” calendar stays there: delete it in Google Calendar if you don't need it. Your tasks stay in Plain Week.`
                            : `The “Plain Week” calendar is deleted from ${connection.email}. Your tasks stay in Plain Week.`}
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel disabled={processing}>
                        Cancel
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
                        Disconnect
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
                {connection.lastSyncedAt === null ? (
                    'Waiting for the first sync.'
                ) : (
                    <>
                        Last synced{' '}
                        <time
                            dateTime={connection.lastSyncedAt}
                            title={new Date(
                                connection.lastSyncedAt,
                            ).toLocaleString()}
                        >
                            {formatTimeAgo(connection.lastSyncedAt)}
                        </time>
                        .
                    </>
                )}
            </p>
            {connection.lastError !== null && (
                <Alert variant="destructive" data-test="google-sync-error">
                    <CircleAlert />
                    <AlertTitle>The last sync had a problem</AlertTitle>
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
                        <Badge variant="destructive">Needs reconnecting</Badge>
                    )}
                </CardTitle>
                <CardDescription>
                    {connection === null
                        ? 'Show your planned tasks in a “Plain Week” calendar in your Google account. Changes go one way: edit tasks here, not in Google.'
                        : connection.broken
                          ? `Google stopped accepting Plain Week's access to ${connection.email}. Reconnect to keep your calendar up to date.`
                          : `Connected to ${connection.email}. Your planned tasks show up in its “Plain Week” calendar.`}
                </CardDescription>
            </CardHeader>
            {connection !== null && !connection.broken && (
                <SyncState connection={connection} />
            )}
            <CardFooter className="gap-2">
                {(connection === null || connection.broken) && (
                    <Button asChild>
                        <a href={connect.url()} data-test="google-connect">
                            {connection === null ? 'Connect' : 'Reconnect'}
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
            <Head title="Integrations" />

            <h1 className="sr-only">Integrations</h1>

            <div className="space-y-6">
                <Heading
                    variant="small"
                    title="Integrations"
                    description="Connect Plain Week to other services"
                />

                <GoogleCalendarCard connection={googleCalendar} />
            </div>
        </>
    );
}

Integrations.layout = {
    breadcrumbs: [
        {
            title: 'Integrations',
            href: editIntegrations(),
        },
    ],
};
