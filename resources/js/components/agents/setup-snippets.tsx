import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
                Apps sync your planner through the app API. They sign in with
                OAuth (authorization code with PKCE), or you paste a personal
                token into them. Every request sends the token as a Bearer
                header.
            </p>
            <div className="space-y-2">
                <p className="text-sm font-medium">API base URL</p>
                <CopyField
                    value={api.baseUrl}
                    label="Copy API URL"
                    data-test="agents-api-url"
                />
            </div>
            <div className="space-y-2">
                <p className="text-sm font-medium">Header</p>
                <CopyField
                    value={bearerHeader(bearer)}
                    label="Copy header"
                    data-test="agents-api-header"
                />
            </div>
            <div className="space-y-2">
                <p className="text-sm font-medium">Try it</p>
                <CopyField
                    value={apiCurlCommand(api.baseUrl, bearer)}
                    label="Copy command"
                    multiline
                    data-test="agents-api-curl"
                />
            </div>
            <div className="space-y-2">
                <p className="text-sm font-medium">OAuth server metadata</p>
                <CopyField
                    value={api.authorizationServerMetadataUrl}
                    label="Copy metadata URL"
                    data-test="agents-oauth-metadata"
                />
                <p className="text-sm text-muted-foreground">
                    Lists the authorization, token and registration endpoints.
                    Apps register themselves and redirect to a loopback address
                    or a <code>plainweek://</code> URL.
                </p>
            </div>
        </div>
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

    const subject = mcpUrl === null ? 'Apps' : 'Agents and apps';

    return (
        <Card data-test="agents-setup">
            <CardHeader>
                <CardTitle>
                    {mcpUrl === null
                        ? 'Connect an app'
                        : 'Connect an agent or app'}
                </CardTitle>
                <CardDescription>
                    {subject} get the same access to your planner as you: they
                    can read, add, change and delete tasks.
                </CardDescription>
            </CardHeader>
            <CardContent>
                {mcpUrl === null ? (
                    <AppsSetup api={api} bearer={bearer} />
                ) : (
                    <Tabs defaultValue="claude">
                        <TabsList className="h-auto flex-wrap">
                            <TabsTrigger value="claude">Claude</TabsTrigger>
                            <TabsTrigger value="claude-code">
                                Claude Code
                            </TabsTrigger>
                            <TabsTrigger value="other">
                                Other clients
                            </TabsTrigger>
                            <TabsTrigger value="apps">Apps</TabsTrigger>
                        </TabsList>
                        <TabsContent value="claude" className="space-y-3 pt-2">
                            <ol className="list-decimal space-y-2 ps-5 text-sm text-muted-foreground">
                                <li>
                                    In claude.ai or Claude Desktop, open
                                    Settings › Connectors and choose{' '}
                                    <span className="font-medium text-foreground">
                                        Add custom connector
                                    </span>
                                    .
                                </li>
                                <li>
                                    Name it “Plain Week” and paste the MCP
                                    server URL above.
                                </li>
                                <li>
                                    Choose Connect, then Approve in the Plain
                                    Week window that opens. No token is needed.
                                </li>
                            </ol>
                        </TabsContent>

                        <TabsContent
                            value="claude-code"
                            className="space-y-3 pt-2"
                        >
                            <p className="text-sm text-muted-foreground">
                                Create a personal token below, then run:
                            </p>
                            <CopyField
                                value={claudeCodeCommand(mcpUrl, bearer)}
                                label="Copy command"
                                multiline
                                data-test="agents-claude-code"
                            />
                        </TabsContent>

                        <TabsContent value="other" className="space-y-3 pt-2">
                            <p className="text-sm text-muted-foreground">
                                For clients that support remote MCP servers
                                (Streamable HTTP). Those that support OAuth only
                                need the URL; the others send a personal token:
                            </p>
                            <CopyField
                                value={jsonConfig(mcpUrl, bearer)}
                                label="Copy configuration"
                                multiline
                                data-test="agents-json"
                            />
                        </TabsContent>

                        <TabsContent value="apps" className="pt-2">
                            <AppsSetup api={api} bearer={bearer} />
                        </TabsContent>
                    </Tabs>
                )}
            </CardContent>
        </Card>
    );
}
