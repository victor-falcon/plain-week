import { Head, router } from '@inertiajs/react';
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
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    Card,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { edit as editIntegrations } from '@/routes/integrations';
import { connect, destroy } from '@/routes/integrations/google';

type GoogleCalendarConnection = {
    email: string;
    broken: boolean;
};

type Props = {
    googleCalendar: GoogleCalendarConnection | null;
};

function DisconnectButton({ email }: { email: string }) {
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
                        The “Plain Week” calendar is deleted from {email}. Your
                        tasks stay in Plain Week.
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
            <CardFooter className="gap-2">
                {(connection === null || connection.broken) && (
                    <Button asChild>
                        <a href={connect.url()} data-test="google-connect">
                            {connection === null ? 'Connect' : 'Reconnect'}
                        </a>
                    </Button>
                )}
                {connection !== null && (
                    <DisconnectButton email={connection.email} />
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
