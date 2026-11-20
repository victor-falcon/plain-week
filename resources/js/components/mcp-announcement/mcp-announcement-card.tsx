import { Link, usePage } from '@inertiajs/react';
import { useRef, useSyncExternalStore } from 'react';
import { FloatingCard } from '@/components/floating-card';
import {
    AGENT_PROMPTS,
    AgentPrompts,
} from '@/components/mcp-announcement/agent-prompts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { mcpAnnouncementStore } from '@/lib/mcp-announcement';
import { cn } from '@/lib/utils';
import { edit as editAgents } from '@/routes/agents';
import { plans } from '@/routes/billing';

const pill = 'h-12 rounded-full text-base font-semibold';
const solidPill = 'bg-foreground text-background hover:bg-foreground/90';
const outlinePill =
    'border-2 border-foreground bg-background text-foreground hover:bg-muted dark:bg-background';

/**
 * The one-time announcement of the MCP connector for signed-in users: what it
 * is, two example requests and the way to Settings › Agents & apps (or to the
 * plans, in SaaS mode without one). Opened by the planner page
 * (`mcpAnnouncementStore`); any way of closing it marks it seen on this device.
 */
export function McpAnnouncementCard() {
    const hasAccess = usePage().props.account?.hasAccess ?? true;
    const primary = useRef<HTMLAnchorElement>(null);

    return (
        <FloatingCard
            title="Your AI agent can plan your week"
            description="Connect Claude, ChatGPT or any MCP client. It reads and changes your planner like you do, only after you approve it, and you can revoke it any time."
            onClose={mcpAnnouncementStore.close}
            toolbar={
                <Badge
                    className="bg-foreground text-background"
                    data-test="mcp-announcement-badge"
                >
                    New
                </Badge>
            }
            onOpenAutoFocus={(event) => {
                event.preventDefault();
                primary.current?.focus();
            }}
        >
            <AgentPrompts prompts={[AGENT_PROMPTS[0], AGENT_PROMPTS[2]]} />

            <p
                className="text-sm leading-normal text-muted-foreground"
                data-test="mcp-announcement-note"
            >
                {hasAccess
                    ? 'Set it up in Settings › Agents & apps.'
                    : 'It comes with the sync plan. Once you have it, set it up in Settings › Agents & apps.'}
            </p>

            <div className="grid grid-cols-2 gap-3">
                <Button
                    variant="outline"
                    className={cn(pill, outlinePill)}
                    onClick={mcpAnnouncementStore.close}
                    data-test="mcp-announcement-dismiss"
                >
                    Not now
                </Button>
                <Button asChild className={cn(pill, solidPill)}>
                    <Link
                        ref={primary}
                        href={hasAccess ? editAgents() : plans()}
                        onClick={mcpAnnouncementStore.close}
                        data-test="mcp-announcement-connect"
                    >
                        {hasAccess ? 'Connect an agent' : 'See plans'}
                    </Link>
                </Button>
            </div>
        </FloatingCard>
    );
}

/** Renders the card while `mcpAnnouncementStore` has it open. */
export function McpAnnouncementDialog() {
    const isOpen = useSyncExternalStore(
        mcpAnnouncementStore.subscribe,
        mcpAnnouncementStore.isOpen,
        () => false,
    );

    return isOpen ? <McpAnnouncementCard /> : null;
}
