import { Smartphone } from 'lucide-react';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { installAppStore, isReachableFromPhone } from '@/lib/install-app';

/**
 * Whether to offer "Install mobile app": a phone can open this address and
 * this is not a touch screen (there you are already on the phone).
 */
function canOfferInstall(): boolean {
    const coarse =
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(pointer: coarse)').matches;

    return isReachableFromPhone() && !coarse;
}

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
