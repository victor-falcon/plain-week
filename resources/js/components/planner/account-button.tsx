import { Link, usePage } from '@inertiajs/react';
import {
    CloudAlert,
    CloudOff,
    CloudUpload,
    LogIn,
    RefreshCw,
    User as UserIcon,
    UserPlus,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from '@/components/ui/tooltip';
import { UserMenuContent } from '@/components/user-menu-content';
import { useInitials } from '@/hooks/use-initials';
import { usePendingChangeCount } from '@/hooks/use-tasks';
import { useVisibleSyncStatus } from '@/hooks/use-visible-sync-status';
import type { SyncStatus } from '@/lib/sync';
import type { User } from '@/types';
import { login, register } from '@/routes';

const STATUS_LABELS: Record<SyncStatus, string> = {
    idle: 'All changes synced',
    syncing: 'Syncing…',
    offline: 'Offline. Changes are saved on this device and sync later.',
    error: 'Some changes could not be synced.',
};

function StatusBadge({ status }: { status: SyncStatus }) {
    const icon = {
        idle: null,
        syncing: <RefreshCw className="size-3 animate-spin" />,
        offline: <CloudOff className="size-3" />,
        error: <CloudAlert className="size-3 text-destructive" />,
    }[status];

    if (icon === null) {
        return null;
    }

    return (
        <span
            data-sync-status={status}
            className="absolute -end-0.5 -bottom-0.5 flex size-4.5 items-center justify-center rounded-full bg-background shadow-sm ring-1 ring-border"
        >
            {icon}
        </span>
    );
}

function WithTooltip({
    label,
    children,
}: {
    label: string;
    children: ReactNode;
}) {
    return (
        <Tooltip>
            <TooltipTrigger asChild>{children}</TooltipTrigger>
            <TooltipContent side="bottom">{label}</TooltipContent>
        </Tooltip>
    );
}

const roundButton = 'relative size-10 rounded-full';

function UserAccountMenu({ user }: { user: User }) {
    const status = useVisibleSyncStatus();
    const getInitials = useInitials();

    return (
        <DropdownMenu>
            <WithTooltip label={STATUS_LABELS[status]}>
                <DropdownMenuTrigger asChild>
                    <Button
                        variant="secondary"
                        size="icon-lg"
                        className={roundButton}
                        aria-label={`Account menu. ${STATUS_LABELS[status]}`}
                        data-test="account-button"
                    >
                        <Avatar className="size-10">
                            <AvatarImage src={user.avatar} alt={user.name} />
                            <AvatarFallback className="bg-secondary text-sm font-medium text-secondary-foreground">
                                {getInitials(user.name)}
                            </AvatarFallback>
                        </Avatar>
                        <StatusBadge status={status} />
                    </Button>
                </DropdownMenuTrigger>
            </WithTooltip>
            <DropdownMenuContent className="min-w-56" align="end">
                <UserMenuContent user={user} />
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

/** Highlighted, pulsing button inviting a guest with local work to sign up. */
function GuestSaveButton() {
    return (
        <WithTooltip label="Save your tasks: create a free account to sync them">
            <Button
                asChild
                size="icon-lg"
                className={roundButton}
                data-test="save-button"
            >
                <Link
                    href={register()}
                    aria-label="Save your tasks: create an account"
                >
                    <span
                        aria-hidden
                        className="absolute -inset-1 animate-pulse rounded-full border-2 border-primary/50 motion-reduce:animate-none"
                    />
                    <CloudUpload className="size-5" />
                </Link>
            </Button>
        </WithTooltip>
    );
}

function GuestMenu() {
    return (
        <DropdownMenu>
            <WithTooltip label="Log in to sync your tasks">
                <DropdownMenuTrigger asChild>
                    <Button
                        variant="secondary"
                        size="icon-lg"
                        className={roundButton}
                        aria-label="Account"
                        data-test="account-button"
                    >
                        <UserIcon className="size-5" />
                    </Button>
                </DropdownMenuTrigger>
            </WithTooltip>
            <DropdownMenuContent className="min-w-48" align="end">
                <DropdownMenuItem asChild>
                    <Link href={login()} className="cursor-pointer">
                        <LogIn className="me-2" />
                        Log in
                    </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                    <Link href={register()} className="cursor-pointer">
                        <UserPlus className="me-2" />
                        Create account
                    </Link>
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

function GuestAccountButton() {
    const pendingChanges = usePendingChangeCount() ?? 0;

    return pendingChanges > 0 ? <GuestSaveButton /> : <GuestMenu />;
}

/**
 * The account button of the planner header. Users get their menu and a subtle
 * sync status; guests get log in / register, and once they have local work a
 * highlighted "save" button that leads to registration.
 */
export function AccountButton() {
    const { auth } = usePage().props;

    return auth.user ? (
        <UserAccountMenu user={auth.user} />
    ) : (
        <GuestAccountButton />
    );
}
