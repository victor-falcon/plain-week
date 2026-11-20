import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import { destroy } from '@/routes/agents/apps';
import { AgentAccessList } from './agent-access-list';
import type { AgentAccess } from './agent-access-list';
import { RevokeButton } from './revoke-button';

/** The apps the user approved on the OAuth consent card (claude.ai, Claude Desktop, …). */
export function OAuthApps({ apps }: { apps: AgentAccess[] }) {
    return (
        <Card data-test="agents-apps">
            <CardHeader>
                <CardTitle>Connected apps</CardTitle>
                <CardDescription>
                    Apps you approved when they asked to connect to Plain Week.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <AgentAccessList
                    items={apps}
                    created="Connected"
                    empty="No apps connected yet."
                    data-test="agents-app-list"
                    action={(app) => (
                        <RevokeButton
                            action={destroy(app.id)}
                            label="Disconnect"
                            title={`Disconnect ${app.name}?`}
                            description={`${app.name} loses access to your planner at once. To use it again, connect it again and approve it.`}
                            data-test="agents-app-revoke"
                        />
                    )}
                />
            </CardContent>
        </Card>
    );
}
