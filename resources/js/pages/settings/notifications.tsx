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
import { t } from '@/lib/i18n';
import { deviceState, disable, enable } from '@/lib/notifications/device';
import type { DeviceState } from '@/lib/notifications/device';
import { update } from '@/routes/notifications';

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
                <AlertTitle>
                    {t('settings.notifications.needsInstallTitle')}
                </AlertTitle>
                <AlertDescription>
                    {t('settings.notifications.needsInstall')}
                </AlertDescription>
            </Alert>
        );
    }

    if (state.support === 'unsupported') {
        return (
            <Alert data-test="notifications-unsupported">
                <BellOff />
                <AlertTitle>
                    {t('settings.notifications.unsupportedTitle')}
                </AlertTitle>
                <AlertDescription>
                    {t('settings.notifications.unsupported')}
                </AlertDescription>
            </Alert>
        );
    }

    if (state.permission === 'denied') {
        return (
            <Alert data-test="notifications-denied">
                <BellOff />
                <AlertTitle>
                    {t('settings.notifications.deniedTitle')}
                </AlertTitle>
                <AlertDescription>
                    {t('settings.notifications.denied')}
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
                      toast.success(t('settings.notifications.turnedOn'));
                  } else if (Notification.permission === 'default') {
                      toast.info(t('settings.notifications.stayOff'));
                  }
              })
            : disable().then(() => {
                  toast.success(t('settings.notifications.turnedOff'));
              });

        done.catch(() => {
            toast.error(
                !on
                    ? t('settings.notifications.turnOffFailed')
                    : navigator.onLine
                      ? t('settings.notifications.turnOnFailed')
                      : t('settings.notifications.offline'),
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
                        {t('settings.notifications.deviceLabel')}
                    </Label>
                    <p
                        id="notifications-device-hint"
                        className="text-sm text-muted-foreground"
                    >
                        {t('settings.notifications.deviceHint')}
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
            {({ processing, errors }) => (
                <>
                    <div className="grid gap-2">
                        <Label htmlFor="morning-time">
                            {t('settings.notifications.morningLabel')}
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
                                ? t('settings.notifications.timezone', {
                                      timezone,
                                  })
                                : t('settings.notifications.timezoneUnknown')}
                        </p>
                        <InputError message={errors.morning_time} />
                    </div>

                    <Button
                        disabled={processing}
                        data-test="notifications-save"
                    >
                        {t('common.save')}
                    </Button>
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
            <Head title={t('settings.notifications.title')} />

            <h1 className="sr-only">{t('settings.notifications.title')}</h1>

            <div className="space-y-6">
                <Heading
                    variant="small"
                    title={t('settings.notifications.title')}
                    description={t('settings.notifications.description')}
                />

                <p className="text-sm text-muted-foreground">
                    {t('settings.notifications.explanation')}
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
