import { Head, Link, usePage } from '@inertiajs/react';
import { CircleAlert } from 'lucide-react';
import { ActivityLog } from '@/components/agents/activity-log';
import type { ActivityPage } from '@/components/agents/activity-log';
import { CopyField } from '@/components/agents/copy-button';
import type { AgentAccess } from '@/components/agents/agent-access-list';
import { OAuthApps } from '@/components/agents/oauth-apps';
import { PersonalTokens } from '@/components/agents/personal-tokens';
import type { NewToken } from '@/components/agents/personal-tokens';
import { SetupSnippets } from '@/components/agents/setup-snippets';
import type { ApiInfo } from '@/components/agents/setup-snippets';
import Heading from '@/components/heading';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import { t } from '@/lib/i18n';
import { tRich } from '@/lib/i18n/rich';
import { plans } from '@/routes/billing';

type Props = {
    /** Null while the instance has the MCP server off (`MCP_ENABLED=false`). */
    mcpUrl: string | null;
    api: ApiInfo;
    personalTokens: AgentAccess[];
    oauthApps: AgentAccess[];
    activity: ActivityPage;
};

/**
 * Settings › Agents & apps: connect AI agents to the planner through the MCP
 * server (`/mcp`) and apps through the app API (`/api/v1`), with OAuth
 * (claude.ai, Claude Desktop, native apps) or a personal token, revoke them
 * and see what agents changed. The MCP part is hidden while the instance has
 * the MCP server off (`mcpUrl` null).
 */
export default function Agents({
    mcpUrl,
    api,
    personalTokens,
    oauthApps,
    activity,
}: Props) {
    const { props, flash } = usePage();
    const needsPlan = props.account?.hasAccess === false;
    const newToken = (flash?.newToken as NewToken | undefined) ?? null;
    const mcpOn = mcpUrl !== null;
    // Only MCP tool calls are logged; without the server, only past entries are worth showing.
    const showActivity = mcpOn || activity.entries.length > 0;

    return (
        <>
            <Head title={t('settings.agents.title')} />

            <h1 className="sr-only">{t('settings.agents.title')}</h1>

            <div className="space-y-6">
                <Heading
                    variant="small"
                    title={t('settings.agents.title')}
                    description={t(
                        mcpOn
                            ? 'settings.agents.description'
                            : 'settings.agents.descriptionApiOnly',
                    )}
                />

                {needsPlan && (
                    <Alert data-test="agents-needs-plan">
                        <CircleAlert />
                        <AlertTitle>
                            {t(
                                mcpOn
                                    ? 'settings.agents.needsPlanTitle'
                                    : 'settings.agents.needsPlanTitleApiOnly',
                            )}
                        </AlertTitle>
                        <AlertDescription>
                            <p>
                                {tRich(
                                    mcpOn
                                        ? 'settings.agents.needsPlan'
                                        : 'settings.agents.needsPlanApiOnly',
                                    {
                                        plan: (text) => (
                                            <Link
                                                href={plans()}
                                                className="font-medium text-foreground underline underline-offset-4"
                                            >
                                                {text}
                                            </Link>
                                        ),
                                    },
                                )}
                            </p>
                        </AlertDescription>
                    </Alert>
                )}

                {mcpOn && (
                    <Card data-test="agents-url">
                        <CardHeader>
                            <CardTitle>
                                {t('settings.agents.url.title')}
                            </CardTitle>
                            <CardDescription>
                                {t('settings.agents.url.description')}
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <CopyField
                                value={mcpUrl}
                                label={t('settings.agents.url.copy')}
                                data-test="agents-mcp-url"
                            />
                        </CardContent>
                    </Card>
                )}

                <SetupSnippets
                    mcpUrl={mcpUrl}
                    api={api}
                    token={newToken?.token ?? null}
                />

                <PersonalTokens tokens={personalTokens} newToken={newToken} />

                <OAuthApps apps={oauthApps} />

                {showActivity && <ActivityLog activity={activity} />}
            </div>
        </>
    );
}
