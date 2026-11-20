import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { t } from '@/lib/i18n';
import { tRich } from '@/lib/i18n/rich';
import { CopyField } from './copy-button';

/** Shown in the snippets until a personal token was just created. */
export const TOKEN_PLACEHOLDER = '<your token>';

export function claudeCodeCommand(url: string, token: string): string {
    return `claude mcp add --transport http plain-week ${url} --header "Authorization: Bearer ${token}"`;
}

/** Where an app finds the app API and the OAuth server. */
export type ApiInfo = {
    baseUrl: string;
    resourceMetadataUrl: string;
    authorizationServerMetadataUrl: string;
};

export function bearerHeader(token: string): string {
    return `Authorization: Bearer ${token}`;
}

export function apiCurlCommand(baseUrl: string, token: string): string {
    return `curl -H "${bearerHeader(token)}" ${baseUrl}/me`;
}

export function jsonConfig(url: string, token: string): string {
    return JSON.stringify(
        {
            mcpServers: {
                'plain-week': {
                    type: 'http',
                    url,
                    headers: { Authorization: `Bearer ${token}` },
                },
            },
        },
        null,
        2,
    );
}

/**
 * How an app (the Plain Week apps, a script) reaches the app API: its base
 * URL, the Bearer header and where OAuth clients discover the endpoints.
 */
function AppsSetup({ api, bearer }: { api: ApiInfo; bearer: string }) {
    return (
        <div className="space-y-4" data-test="agents-apps-setup">
            <p className="text-sm text-muted-foreground">
                {t('settings.agents.apps.setup.signIn')}
            </p>
            <p className="text-sm text-muted-foreground">
                {t('settings.agents.apps.setup.building')}
            </p>
            <div className="space-y-2">
                <p className="text-sm font-medium">
                    {t('settings.agents.apps.setup.baseUrl')}
                </p>
                <CopyField
                    value={api.baseUrl}
                    label={t('settings.agents.apps.setup.copyApiUrl')}
                    data-test="agents-api-url"
                />
            </div>
            <div className="space-y-2">
                <p className="text-sm font-medium">
                    {t('settings.agents.apps.setup.header')}
                </p>
                <CopyField
                    value={bearerHeader(bearer)}
                    label={t('settings.agents.apps.setup.copyHeader')}
                    data-test="agents-api-header"
                />
            </div>
            <div className="space-y-2">
                <p className="text-sm font-medium">
                    {t('settings.agents.apps.setup.tryIt')}
                </p>
                <CopyField
                    value={apiCurlCommand(api.baseUrl, bearer)}
                    label={t('settings.agents.setup.copyCommand')}
                    multiline
                    data-test="agents-api-curl"
                />
            </div>
            <div className="space-y-2">
                <p className="text-sm font-medium">
                    {t('settings.agents.apps.setup.metadata')}
                </p>
                <CopyField
                    value={api.authorizationServerMetadataUrl}
                    label={t('settings.agents.apps.setup.copyMetadataUrl')}
                    data-test="agents-oauth-metadata"
                />
                <p className="text-sm text-muted-foreground">
                    {tRich('settings.agents.apps.setup.metadataHint', {
                        code: (text) => <code>{text}</code>,
                    })}
                </p>
            </div>
        </div>
    );
}

function SetupCard({
    title,
    description,
    children,
}: {
    title: string;
    description: string;
    children: React.ReactNode;
}) {
    return (
        <Card data-test="agents-setup">
            <CardHeader>
                <CardTitle>{title}</CardTitle>
                <CardDescription>{description}</CardDescription>
            </CardHeader>
            <CardContent>{children}</CardContent>
        </Card>
    );
}

/**
 * How to connect the common MCP clients and apps. claude.ai and Claude Desktop
 * sign in with OAuth (the consent card); Claude Code and generic clients send
 * a personal token, filled in once one was just created. Without the MCP
 * server (`mcpUrl` null) only the app setup is shown.
 */
export function SetupSnippets({
    mcpUrl,
    api,
    token,
}: {
    mcpUrl: string | null;
    api: ApiInfo;
    /** The personal token just created, if any. */
    token: string | null;
}) {
    const bearer = token ?? TOKEN_PLACEHOLDER;

    if (mcpUrl === null) {
        return (
            <SetupCard
                title={t('settings.agents.setup.titleApps')}
                description={t('settings.agents.setup.descriptionApps')}
            >
                <AppsSetup api={api} bearer={bearer} />
            </SetupCard>
        );
    }

    return (
        <SetupCard
            title={t('settings.agents.setup.title')}
            description={t('settings.agents.setup.description')}
        >
            <Tabs defaultValue="claude">
                <TabsList className="max-w-full justify-start overflow-x-auto">
                    <TabsTrigger value="claude">Claude</TabsTrigger>
                    <TabsTrigger value="claude-code">Claude Code</TabsTrigger>
                    <TabsTrigger value="other">
                        {t('settings.agents.setup.otherClients')}
                    </TabsTrigger>
                    <TabsTrigger value="apps">
                        {t('settings.agents.setup.appsTab')}
                    </TabsTrigger>
                </TabsList>
                <TabsContent value="claude" className="space-y-3 pt-2">
                    <ol className="list-decimal space-y-2 ps-5 text-sm text-muted-foreground">
                        <li>
                            {tRich('settings.agents.setup.claudeStep1', {
                                strong: (text) => (
                                    <span className="font-medium text-foreground">
                                        {text}
                                    </span>
                                ),
                            })}
                        </li>
                        <li>{t('settings.agents.setup.claudeStep2')}</li>
                        <li>{t('settings.agents.setup.claudeStep3')}</li>
                    </ol>
                </TabsContent>

                <TabsContent value="claude-code" className="space-y-3 pt-2">
                    <p className="text-sm text-muted-foreground">
                        {t('settings.agents.setup.claudeCodeIntro')}
                    </p>
                    <CopyField
                        value={claudeCodeCommand(mcpUrl, bearer)}
                        label={t('settings.agents.setup.copyCommand')}
                        multiline
                        data-test="agents-claude-code"
                    />
                </TabsContent>

                <TabsContent value="other" className="space-y-3 pt-2">
                    <p className="text-sm text-muted-foreground">
                        {t('settings.agents.setup.otherIntro')}
                    </p>
                    <CopyField
                        value={jsonConfig(mcpUrl, bearer)}
                        label={t('settings.agents.setup.copyConfiguration')}
                        multiline
                        data-test="agents-json"
                    />
                </TabsContent>

                <TabsContent value="apps" className="pt-2">
                    <AppsSetup api={api} bearer={bearer} />
                </TabsContent>
            </Tabs>
        </SetupCard>
    );
}
