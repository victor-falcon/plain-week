import { Head } from '@inertiajs/react';
import Heading from '@/components/heading';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useCarryOverSetting } from '@/hooks/use-carry-over-setting';
import { carryOverSetting } from '@/lib/planner/preferences';
import { edit as editPreferences } from '@/routes/preferences';

/**
 * Settings › Preferences: planner behaviour. The values live in this
 * browser (per device), so they apply offline and need no server.
 */
export default function Preferences() {
    const carryOver = useCarryOverSetting();

    return (
        <>
            <Head title="Preferences" />

            <h1 className="sr-only">Preferences</h1>

            <div className="space-y-6">
                <Heading
                    variant="small"
                    title="Planner"
                    description="How the planner behaves on this device"
                />
                <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1">
                        <Label htmlFor="carry-over">
                            Move unfinished tasks to today
                        </Label>
                        <p className="text-sm text-muted-foreground">
                            When the planner opens and when the day changes,
                            tasks from earlier days that are not done move to
                            the end of today. Recurring and Someday tasks stay
                            where they are. Applies to this device only.
                        </p>
                    </div>
                    <Switch
                        id="carry-over"
                        checked={carryOver}
                        onCheckedChange={carryOverSetting.setEnabled}
                        data-test="carry-over-switch"
                    />
                </div>
            </div>
        </>
    );
}

Preferences.layout = {
    breadcrumbs: [
        {
            title: 'Preferences',
            href: editPreferences(),
        },
    ],
};
