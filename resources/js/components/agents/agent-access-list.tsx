import type { ReactNode } from 'react';
import { t, intlLocale } from '@/lib/i18n';
import type { TextKey } from '@/lib/i18n';
import { renderRich } from '@/lib/i18n/rich';
import { formatTimeAgo } from '@/lib/settings/relative-time';

type CreatedKey = 'settings.agents.created' | 'settings.agents.connected';

/** A personal token or a connected OAuth app, as Settings › Agents & apps lists them. */
export type AgentAccess = {
    id: string;
    name: string;
    createdAt: string | null;
    lastUsedAt: string | null;
};

/** `text` ("5 minutes ago") as a <time> with the exact moment in its title. */
function whenRenderer(iso: string) {
    return {
        when: (text: ReactNode) => (
            <time
                dateTime={iso}
                title={new Date(iso).toLocaleString(intlLocale())}
            >
                {text}
            </time>
        ),
    };
}

/** A catalog message with a `<when>{time}</when>` span, rendered as a <time>. */
function withWhen(key: TextKey, iso: string): ReactNode {
    return renderRich(t(key, { time: formatTimeAgo(iso) }), whenRenderer(iso));
}

/** "Created 3 days ago · Last used 5 minutes ago" ("Never used" before the first call). */
function Dates({ item, created }: { item: AgentAccess; created: CreatedKey }) {
    return (
        <p className="text-xs text-muted-foreground">
            {item.createdAt !== null && (
                <>{withWhen(created, item.createdAt)} · </>
            )}
            {item.lastUsedAt === null
                ? t('settings.agents.neverUsed')
                : withWhen('settings.agents.lastUsed', item.lastUsedAt)}
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
    /** The message with the first date ("Created …", "Connected …"). */
    created: CreatedKey;
    empty: TextKey;
    action: (item: AgentAccess) => ReactNode;
    'data-test'?: string;
}) {
    if (items.length === 0) {
        return <p className="text-sm text-muted-foreground">{t(empty)}</p>;
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
