import { Form, Head, usePage } from '@inertiajs/react';
import { BellOff, Smartphone } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import Heading from '@/components/heading';
import InputError from '@/components/input-error';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { Switch } from '@/components/ui/switch';
import { deviceState, disable, enable } from '@/lib/notifications/device';
import type { DeviceState } from '@/lib/notifications/device';
import { edit, update } from '@/lib/notifications/routes';

type Props = {
    /** 'HH:mm' in the user's time zone. */
    morningTime: string;
    /** The IANA time zone the server uses, null until a device synced. */
    timezone: string | null;
};

/** This device's push state, re-read when the page comes back into view. */
function useDeviceState() {
    const [state, setState] = useState<DeviceState | null>(null);

    const refresh = useCallback(() => {
        void deviceState().then(setState);
    }, []);

    useEffect(() => {
        refresh();

        // The permission may change in the browser's site settings meanwhile.
        const onVisible = () => {
            if (document.visibilityState === 'visible') {
                refresh();
            }
        };

        document.addEventListener('visibilitychange', onVisible);

        return () =>
            document.removeEventListener('visibilitychange', onVisible);
    }, [refresh]);

    return [state, setState] as const;
}

function DeviceNotice({ state }: { state: DeviceState }) {
    if (state.support === 'needs-install') {
        return (
            <Alert data-test="notifications-needs-install">
                <Smartphone />
                <AlertTitle>Add Plain Week to your Home Screen</AlertTitle>
                <AlertDescription>
                    On iPhone and iPad, notifications only work in the app added
                    to the Home Screen (iOS 16.4 or later). In Safari, tap
                    Share, then Add to Home Screen, open Plain Week from there
                    and turn notifications on.
                </AlertDescription>
            </Alert>
        );
    }

    if (state.support === 'unsupported') {
        return (
            <Alert data-test="notifications-unsupported">
                <BellOff />
                <AlertTitle>Not available in this browser</AlertTitle>
                <AlertDescription>
                    This browser can't receive notifications from Plain Week.
                    Recent versions of Chrome, Edge, Firefox and Safari can.
                </AlertDescription>
            </Alert>
        );
    }

    if (state.permission === 'denied') {
        return (
            <Alert data-test="notifications-denied">
                <BellOff />
                <AlertTitle>Notifications are blocked</AlertTitle>
                <AlertDescription>
                    This browser blocks notifications from Plain Week. Allow
                    them in its settings for this site (usually behind the icon
                    next to the address), then come back here and turn them on.
                </AlertDescription>
            </Alert>
        );
    }

    return null;
}

function DeviceSwitch({ vapidPublicKey }: { vapidPublicKey: string }) {
    const [state, setState] = useDeviceState();
    const [busy, setBusy] = useState(false);

    const toggle = (on: boolean) => {
        setBusy(true);

        const done = on
            ? enable(vapidPublicKey).then((granted) => {
                  if (granted) {
                      toast.success('Notifications are on for this device.');
                  } else if (Notification.permission === 'default') {
                      toast.info(
                          'Notifications stay off: allow them when the browser asks.',
                      );
                  }
              })
            : disable().then(() => {
                  toast.success('Notifications are off for this device.');
              });

        done.catch(() => {
            toast.error(
                !on
                    ? 'Could not turn off notifications. Try again.'
                    : navigator.onLine
                      ? 'Could not turn on notifications. Reload the page and try again.'
                      : "You're offline. Turn notifications on once you're back online.",
            );
        }).finally(() => {
            void deviceState().then((next) => {
                setState(next);
                setBusy(false);
            });
        });
    };

    const available =
        state !== null &&
        state.support === 'supported' &&
        state.permission !== 'denied';

    return (
        <div className="space-y-4">
            <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                    <Label htmlFor="notifications-device">
                        Notifications on this device
                    </Label>
                    <p
                        id="notifications-device-hint"
                        className="text-sm text-muted-foreground"
                    >
                        Turn them on on each phone or computer where you want
                        them. Signing out turns them off here.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    {busy && <Spinner />}
                    <Switch
                        id="notifications-device"
                        checked={state?.enabled ?? false}
                        disabled={!available || busy}
                        onCheckedChange={toggle}
                        aria-describedby="notifications-device-hint"
                        data-test="notifications-device-switch"
                    />
                </div>
            </div>

            {state && <DeviceNotice state={state} />}
        </div>
    );
}

function MorningTimeForm({ morningTime, timezone }: Props) {
    return (
        <Form
            {...update.form()}
            options={{ preserveScroll: true }}
            className="space-y-4"
        >
            {({ processing, recentlySuccessful, errors }) => (
                <>
                    <div className="grid gap-2">
                        <Label htmlFor="morning-time">
                            Morning notifications
                        </Label>
                        <Input
                            id="morning-time"
                            type="time"
                            name="morning_time"
                            step={60}
                            required
                            defaultValue={morningTime}
                            className="w-32 tabular-nums"
                            data-test="notifications-morning-time"
                        />
                        <p className="text-sm text-muted-foreground">
                            {timezone
                                ? `In your time zone, ${timezone}, taken from the last device that synced.`
                                : 'In your time zone once one of your devices has synced. Until then, in the time zone of this Plain Week server.'}
                        </p>
                        <InputError message={errors.morning_time} />
                    </div>

                    <div className="flex items-center gap-4">
                        <Button
                            disabled={processing}
                            data-test="notifications-save"
                        >
                            Save
                        </Button>
                        {recentlySuccessful && (
                            <p className="text-sm text-muted-foreground">
                                Saved
                            </p>
                        )}
                    </div>
                </>
            )}
        </Form>
    );
}

/**
 * Settings › Notifications: Web Push reminders for planned tasks. Listed only
 * when the instance has VAPID keys. Whether this device gets them is the
 * browser's push subscription; the morning time is on the account.
 */
export default function Notifications({ morningTime, timezone }: Props) {
    const { notifications } = usePage().props;

    return (
        <>
            <Head title="Notifications" />

            <h1 className="sr-only">Notifications</h1>

            <div className="space-y-6">
                <Heading
                    variant="small"
                    title="Notifications"
                    description="Reminders for the tasks you plan"
                />

                <p className="text-sm text-muted-foreground">
                    Every morning you get one notification for each task planned
                    for that day that isn't done yet. Tasks with a time also get
                    one 5 minutes before they start. Opening a notification
                    opens its task.
                </p>

                {notifications?.vapidPublicKey && (
                    <DeviceSwitch
                        vapidPublicKey={notifications.vapidPublicKey}
                    />
                )}

                <MorningTimeForm
                    morningTime={morningTime}
                    timezone={timezone}
                />
            </div>
        </>
    );
}

Notifications.layout = {
    breadcrumbs: [
        {
            title: 'Notifications',
            href: edit(),
        },
    ],
};
