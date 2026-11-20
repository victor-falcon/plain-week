import { Smartphone } from 'lucide-react';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { t } from '@/lib/i18n';
import { canOfferInstall, installAppStore } from '@/lib/install-app';

/** "Install mobile app" for the account menus: opens the install card. */
export function InstallAppMenuItem() {
    if (!canOfferInstall()) {
        return null;
    }

    return (
        <DropdownMenuItem
            className="cursor-pointer"
            onSelect={installAppStore.open}
            data-test="install-mobile-app"
        >
            <Smartphone className="me-2" />
            {t('pwa.installMobileApp')}
        </DropdownMenuItem>
    );
}
