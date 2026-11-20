import { Head, Link, usePage } from '@inertiajs/react';
import { CircleAlert } from 'lucide-react';
import { CopyField } from '@/components/agents/copy-button';
import type { AgentAccess } from '@/components/agents/agent-access-list';
import { OAuthApps } from '@/components/agents/oauth-apps';
import { PersonalTokens } from '@/components/agents/personal-tokens';
import type { NewToken } from '@/components/agents/personal-tokens';
import { SetupSnippets } from '@/components/agents/setup-snippets';
import Heading from '@/components/heading';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import { edit as editAgents } from '@/routes/agents';
import { plans } from '@/routes/billing';

type Props = {
    mcpUrl: string;
    personalTokens: AgentAccess[];
    oauthApps: AgentAccess[];
};

/**
 * Settings › Agents: connect AI agents to the planner through the MCP server
 * (`/mcp`), with OAuth (claude.ai, Claude Desktop) or a personal token.
 * Shown only while the instance has it on (`mcp.enabled`).
 */
export default function Agents({ mcpUrl, personalTokens, oauthApps }: Props) {
    const { props, flash } = usePage();
    const needsPlan = props.account?.hasAccess === false;
    const newToken = (flash?.newToken as NewToken | undefined) ?? null;

    return (
        <>
            <Head title="Agents" />

            <h1 className="sr-only">Agents</h1>

            <div className="space-y-6">
                <Heading
                    variant="small"
                    title="Agents"
                    description="Let AI agents like Claude read and plan your week"
                />

                {needsPlan && (
                    <Alert data-test="agents-needs-plan">
                        <CircleAlert />
                        <AlertTitle>Agents need a paid plan</AlertTitle>
                        <AlertDescription>
                            <p>
                                You can set up a connection now; agents can use
                                your planner once you{' '}
                                <Link
                                    href={plans()}
                                    className="font-medium text-foreground underline underline-offset-4"
                                >
                                    choose a plan
                                </Link>
                                .
                            </p>
                        </AlertDescription>
                    </Alert>
                )}

                <Card data-test="agents-url">
                    <CardHeader>
                        <CardTitle>MCP server URL</CardTitle>
                        <CardDescription>
                            Plain Week is an MCP server: add this URL to any
                            agent that supports remote MCP servers.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <CopyField
                            value={mcpUrl}
                            label="Copy URL"
                            data-test="agents-mcp-url"
                        />
                    </CardContent>
                </Card>

                <SetupSnippets url={mcpUrl} token={newToken?.token ?? null} />

                <PersonalTokens tokens={personalTokens} newToken={newToken} />

                <OAuthApps apps={oauthApps} />

                {/* Activity (what agents did lately) goes here, after the connections. */}
            </div>
        </>
    );
}

Agents.layout = {
    breadcrumbs: [
        {
            title: 'Agents',
            href: editAgents(),
        },
    ],
};
