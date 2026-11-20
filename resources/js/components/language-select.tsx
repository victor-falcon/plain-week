import { router, usePage } from '@inertiajs/react';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { availableLocales, languageName, t, toLanguageTag } from '@/lib/i18n';
import { update } from '@/routes/language';

/** The `Select` value for "follow the browser" (the account stores null). */
const BROWSER = 'browser';

/**
 * Settings › Preferences › Language: the account's interface language, or the
 * browser's. Lists English plus the languages the instance adds with
 * translation files; the page reloads in the new language once it is saved.
 */
export function LanguageSelect() {
    const { auth } = usePage().props;
    const current = auth.user.language ?? BROWSER;

    const change = (value: string) => {
        router.patch(
            update().url,
            { language: value === BROWSER ? null : value },
            { preserveScroll: true },
        );
    };

    return (
        <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
                <Label htmlFor="language">
                    {t('preferences.languageLabel')}
                </Label>
                <p className="text-sm text-muted-foreground">
                    {t('preferences.languageHint')}
                </p>
            </div>
            <Select value={current} onValueChange={change}>
                <SelectTrigger
                    id="language"
                    className="w-44 shrink-0"
                    data-test="language-select"
                >
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value={BROWSER}>
                        {t('preferences.languageBrowser')}
                    </SelectItem>
                    {availableLocales().map((locale) => (
                        <SelectItem
                            key={locale}
                            value={locale}
                            lang={toLanguageTag(locale)}
                        >
                            {languageName(locale)}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>
    );
}
