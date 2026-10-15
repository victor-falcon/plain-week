import { Link, usePage } from '@inertiajs/react';
import {
    CloudAlert,
    CloudOff,
    Download,
    LogIn,
    RefreshCw,
    User as UserIcon,
    UserPlus,
} from 'lucide-react';
import { useEffect, useState } from 'react';
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
import { useSyncStatus } from '@/hooks/use-sync-status';
import { usePendingChangeCount } from '@/hooks/use-tasks';
import type { SyncStatus } from '@/lib/sync';
import { login, register } from '@/routes';

/** Sync runs are frequent and short; only show ones that take a while. */
const SYNCING_INDICATOR_DELAY_MS = 600;

function useVisibleSyncStatus(): SyncStatus {
    const status = useSyncStatus();
    const [slowSync, setSlowSync] = useState(false);

    useEffect(() => {
        if (status !== 'syncing') {
            return;
        }

        const timer = window.setTimeout(
            () => setSlowSync(true),
            SYNCING_INDICATOR_DELAY_MS,
        );

        return () => {
            window.clearTimeout(timer);
            setSlowSync(false);
        };
    }, [status]);

    return status === 'syncing' && !slowSync ? 'idle' : status;
}

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

/**
 * The account button of the planner header. Users get their menu and a subtle
 * sync status; guests get log in / register, and once they have local work a
 * highlighted "save" button that leads to registration.
 */
export function AccountButton() {
    const { auth } = usePage().props;
    const status = useVisibleSyncStatus();
    const pendingChanges = usePendingChangeCount() ?? 0;
    const getInitials = useInitials();

    if (auth.user) {
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
                                <AvatarImage
                                    src={auth.user.avatar}
                                    alt={auth.user.name}
                                />
                                <AvatarFallback className="bg-secondary text-sm font-medium text-secondary-foreground">
                                    {getInitials(auth.user.name)}
                                </AvatarFallback>
                            </Avatar>
                            <StatusBadge status={status} />
                        </Button>
                    </DropdownMenuTrigger>
                </WithTooltip>
                <DropdownMenuContent className="min-w-56" align="end">
                    <UserMenuContent user={auth.user} />
                </DropdownMenuContent>
            </DropdownMenu>
        );
    }

    if (pendingChanges > 0) {
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
                            className="absolute -inset-1.5 animate-ping rounded-full border-2 border-primary/40 motion-reduce:animate-none"
                        />
                        <Download className="size-5" />
                    </Link>
                </Button>
            </WithTooltip>
        );
    }

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
