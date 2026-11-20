import { Link } from '@inertiajs/react';
import { LogOut, Settings } from 'lucide-react';
import {
    DropdownMenuGroup,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { InstallAppMenuItem } from '@/components/install-app/install-app-menu-item';
import { SendFeedbackMenuItem } from '@/components/send-feedback';
import { UserInfo } from '@/components/user-info';
import { useLogout } from '@/hooks/use-logout';
import { useMobileNavigation } from '@/hooks/use-mobile-navigation';
import { edit } from '@/routes/profile';
import type { User } from '@/types';
import { t } from '@/lib/i18n';

type Props = {
    user: User;
};

export function UserMenuContent({ user }: Props) {
    const cleanup = useMobileNavigation();

    const handleLogout = useLogout(cleanup);

    return (
        <>
            <DropdownMenuLabel className="p-0 font-normal">
                <div className="flex items-center gap-2 px-1 py-1.5 text-start text-sm">
                    <UserInfo user={user} showEmail={true} />
                </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
                <DropdownMenuItem asChild>
                    <Link
                        className="block w-full cursor-pointer"
                        href={edit()}
                        prefetch
                        onClick={cleanup}
                    >
                        <Settings className="me-2" />
                        {t('app.settings')}
                    </Link>
                </DropdownMenuItem>
                <SendFeedbackMenuItem onClick={cleanup} />
                <InstallAppMenuItem />
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem
                className="cursor-pointer"
                onSelect={handleLogout}
                data-test="logout-button"
            >
                <LogOut className="me-2" />
                {t('auth.logOut')}
            </DropdownMenuItem>
        </>
    );
}
