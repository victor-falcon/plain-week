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
 * How to connect the common MCP clients. claude.ai and Claude Desktop sign in
 * with OAuth (the consent card); Claude Code and generic clients send a
 * personal token, filled in once one was just created.
 */
export function SetupSnippets({
    url,
    token,
}: {
    url: string;
    /** The personal token just created, if any. */
    token: string | null;
}) {
    const bearer = token ?? TOKEN_PLACEHOLDER;

    return (
        <Card data-test="agents-setup">
            <CardHeader>
                <CardTitle>Connect an agent</CardTitle>
                <CardDescription>
                    Agents get the same access to your planner as you: they can
                    read, add, change and delete tasks.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <Tabs defaultValue="claude">
                    <TabsList>
                        <TabsTrigger value="claude">Claude</TabsTrigger>
                        <TabsTrigger value="claude-code">
                            Claude Code
                        </TabsTrigger>
                        <TabsTrigger value="other">Other clients</TabsTrigger>
                    </TabsList>

                    <TabsContent value="claude" className="space-y-3 pt-2">
                        <ol className="list-decimal space-y-2 ps-5 text-sm text-muted-foreground">
                            <li>
                                In claude.ai or Claude Desktop, open Settings ›
                                Connectors and choose{' '}
                                <span className="font-medium text-foreground">
                                    Add custom connector
                                </span>
                                .
                            </li>
                            <li>
                                Name it “Plain Week” and paste the MCP server
                                URL above.
                            </li>
                            <li>
                                Choose Connect, then Approve in the Plain Week
                                window that opens. No token is needed.
                            </li>
                        </ol>
                    </TabsContent>

                    <TabsContent value="claude-code" className="space-y-3 pt-2">
                        <p className="text-sm text-muted-foreground">
                            Create a personal token below, then run:
                        </p>
                        <CopyField
                            value={claudeCodeCommand(url, bearer)}
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
                            value={jsonConfig(url, bearer)}
                            label="Copy configuration"
                            multiline
                            data-test="agents-json"
                        />
                    </TabsContent>
                </Tabs>
            </CardContent>
        </Card>
    );
}
