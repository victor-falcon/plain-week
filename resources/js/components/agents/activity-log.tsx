import { Link } from '@inertiajs/react';
import type { ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import { formatTimeAgo } from '@/lib/settings/relative-time';

/** One write an agent made through the MCP server. */
export type ActivityEntry = {
    id: number;
    tool: string;
    summary: string;
    clientType: 'token' | 'oauth';
    clientName: string;
    createdAt: string;
};

const CLIENT_TYPES: Record<ActivityEntry['clientType'], string> = {
    token: 'Personal token',
    oauth: 'Connected app',
};

/** A page of the activity log, newest first. */
export type ActivityPage = {
    entries: ActivityEntry[];
    previousPageUrl: string | null;
    nextPageUrl: string | null;
};

/** "Newer" / "Older" links that reload only the activity prop. */
function PageLink({
    href,
    children,
    ...props
}: {
    href: string | null;
    children: ReactNode;
    'data-test'?: string;
}) {
    if (href === null) {
        return (
            <Button variant="outline" size="sm" disabled {...props}>
                {children}
            </Button>
        );
    }

    return (
        <Button variant="outline" size="sm" asChild {...props}>
            <Link href={href} only={['activity']} preserveScroll preserveState>
                {children}
            </Link>
        </Button>
    );
}

/**
 * Settings › Agents & apps › Activity: what agents changed in the planner (writes
 * only), kept 90 days. Read-only.
 */
export function ActivityLog({ activity }: { activity: ActivityPage }) {
    const { entries, previousPageUrl, nextPageUrl } = activity;
    const paged = previousPageUrl !== null || nextPageUrl !== null;

    return (
        <Card data-test="agents-activity">
            <CardHeader>
                <CardTitle>Activity</CardTitle>
                <CardDescription>
                    What agents changed in your planner over the last 90 days.
                    To undo a change, ask the agent or edit the task in the
                    planner.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                {entries.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                        No changes by agents yet.
                    </p>
                ) : (
                    <ul
                        className="divide-y divide-border"
                        data-test="agents-activity-list"
                    >
                        {entries.map((entry) => (
                            <li
                                key={entry.id}
                                className="space-y-1 py-3 first:pt-0 last:pb-0"
                            >
                                <p className="text-sm break-words">
                                    {entry.summary}
                                </p>
                                <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                                    <span className="font-medium text-foreground">
                                        {entry.clientName}
                                    </span>
                                    <span aria-hidden>·</span>
                                    <span>
                                        {CLIENT_TYPES[entry.clientType]}
                                    </span>
                                    <span aria-hidden>·</span>
                                    <time
                                        dateTime={entry.createdAt}
                                        title={new Date(
                                            entry.createdAt,
                                        ).toLocaleString()}
                                    >
                                        {formatTimeAgo(entry.createdAt)}
                                    </time>
                                </p>
                            </li>
                        ))}
                    </ul>
                )}

                {paged && (
                    <nav
                        aria-label="Activity pages"
                        className="flex items-center justify-between gap-2"
                    >
                        <PageLink
                            href={previousPageUrl}
                            data-test="agents-activity-newer"
                        >
                            <ChevronLeft className="rtl:rotate-180" />
                            Newer
                        </PageLink>
                        <PageLink
                            href={nextPageUrl}
                            data-test="agents-activity-older"
                        >
                            Older
                            <ChevronRight className="rtl:rotate-180" />
                        </PageLink>
                    </nav>
                )}
            </CardContent>
        </Card>
    );
}
