import type { ReactNode } from 'react';
import { formatTimeAgo } from '@/lib/settings/relative-time';

/** A personal token or a connected OAuth app, as Settings › Agents lists them. */
export type AgentAccess = {
    id: string;
    name: string;
    createdAt: string | null;
    lastUsedAt: string | null;
};

function When({ iso }: { iso: string }) {
    return (
        <time dateTime={iso} title={new Date(iso).toLocaleString()}>
            {formatTimeAgo(iso)}
        </time>
    );
}

/** "Created 3 days ago · Last used 5 minutes ago" ("Never used" before the first call). */
function Dates({ item, created }: { item: AgentAccess; created: string }) {
    return (
        <p className="text-xs text-muted-foreground">
            {item.createdAt !== null && (
                <>
                    {created} <When iso={item.createdAt} /> ·{' '}
                </>
            )}
            {item.lastUsedAt === null ? (
                'Never used'
            ) : (
                <>
                    Last used <When iso={item.lastUsedAt} />
                </>
            )}
        </p>
    );
}

/** Rows of name, dates and an action at the end, or `empty` when there are none. */
export function AgentAccessList({
    items,
    created,
    empty,
    action,
    'data-test': dataTest,
}: {
    items: AgentAccess[];
    /** The verb before the first date ("Created", "Connected"). */
    created: string;
    empty: string;
    action: (item: AgentAccess) => ReactNode;
    'data-test'?: string;
}) {
    if (items.length === 0) {
        return <p className="text-sm text-muted-foreground">{empty}</p>;
    }

    return (
        <ul className="divide-y divide-border" data-test={dataTest}>
            {items.map((item) => (
                <li
                    key={item.id}
                    className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0"
                >
                    <div className="min-w-0 space-y-0.5">
                        <p className="truncate text-sm font-medium">
                            {item.name}
                        </p>
                        <Dates item={item} created={created} />
                    </div>
                    {action(item)}
                </li>
            ))}
        </ul>
    );
}
