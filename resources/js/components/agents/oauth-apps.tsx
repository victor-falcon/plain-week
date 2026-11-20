import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import { t } from '@/lib/i18n';
import { destroy } from '@/routes/agents/apps';
import { AgentAccessList } from './agent-access-list';
import type { AgentAccess } from './agent-access-list';
import { RevokeButton } from './revoke-button';

/** The agents and apps the user approved on the OAuth consent card (claude.ai, Claude Desktop, native apps, …). */
export function OAuthApps({ apps }: { apps: AgentAccess[] }) {
    return (
        <Card data-test="agents-apps">
            <CardHeader>
                <CardTitle>{t('settings.agents.apps.title')}</CardTitle>
                <CardDescription>
                    {t('settings.agents.apps.description')}
                </CardDescription>
            </CardHeader>
            <CardContent>
                <AgentAccessList
                    items={apps}
                    created="settings.agents.connected"
                    empty="settings.agents.apps.empty"
                    data-test="agents-app-list"
                    action={(app) => (
                        <RevokeButton
                            action={destroy(app.id)}
                            label={t('settings.agents.apps.disconnect')}
                            title={t('settings.agents.apps.disconnectTitle', {
                                name: app.name,
                            })}
                            description={t(
                                'settings.agents.apps.disconnectDescription',
                                { name: app.name },
                            )}
                            data-test="agents-app-revoke"
                        />
                    )}
                />
            </CardContent>
        </Card>
    );
}
