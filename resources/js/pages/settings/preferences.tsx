import { Head } from '@inertiajs/react';
import Heading from '@/components/heading';
import { LanguageSelect } from '@/components/language-select';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useCarryOverSetting } from '@/hooks/use-carry-over-setting';
import { availableLocales, t } from '@/lib/i18n';
import { carryOverSetting } from '@/lib/planner/preferences';

/**
 * Settings › Preferences: planner behaviour, whose values live in this
 * browser (per device) so they apply offline and need no server, and the
 * interface language, which belongs to the account (emails and push
 * notifications use it too). The language section only shows when the
 * instance offers more than English.
 */
export default function Preferences() {
    const carryOver = useCarryOverSetting();

    return (
        <>
            <Head title={t('preferences.title')} />

            <h1 className="sr-only">{t('preferences.title')}</h1>

            <div className="space-y-6">
                <Heading
                    variant="small"
                    title={t('preferences.plannerHeading')}
                    description={t('preferences.plannerDescription')}
                />
                <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1">
                        <Label htmlFor="carry-over">
                            {t('preferences.carryOverLabel')}
                        </Label>
                        <p className="text-sm text-muted-foreground">
                            {t('preferences.carryOverDescription')}
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

            {availableLocales().length > 1 && (
                <div className="space-y-6">
                    <Heading
                        variant="small"
                        title={t('preferences.languageHeading')}
                        description={t('preferences.languageDescription')}
                    />
                    <LanguageSelect />
                </div>
            )}
        </>
    );
}
