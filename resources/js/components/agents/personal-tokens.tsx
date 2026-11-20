import { Form } from '@inertiajs/react';
import { KeyRound } from 'lucide-react';
import InputError from '@/components/input-error';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { t } from '@/lib/i18n';
import { destroy, store } from '@/routes/agents/tokens';
import { AgentAccessList } from './agent-access-list';
import type { AgentAccess } from './agent-access-list';
import { CopyField } from './copy-button';
import { RevokeButton } from './revoke-button';

export type NewToken = { name: string; token: string };

/**
 * Personal access tokens for agents and apps that don't sign in with OAuth
 * (Claude Code, scripts, an app you paste it into): create one (its secret is
 * shown once) and revoke them.
 */
export function PersonalTokens({
    tokens,
    newToken,
}: {
    tokens: AgentAccess[];
    newToken: NewToken | null;
}) {
    return (
        <Card data-test="agents-tokens">
            <CardHeader>
                <CardTitle>{t('settings.agents.tokens.title')}</CardTitle>
                <CardDescription>
                    {t('settings.agents.tokens.description')}
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                {newToken !== null && (
                    <Alert data-test="agents-new-token">
                        <KeyRound />
                        <AlertTitle>
                            {t('settings.agents.tokens.newTokenTitle', {
                                name: newToken.name,
                            })}
                        </AlertTitle>
                        <AlertDescription className="w-full space-y-2">
                            <p>{t('settings.agents.tokens.newTokenHint')}</p>
                            <CopyField
                                value={newToken.token}
                                label={t('settings.agents.tokens.copy')}
                                multiline
                                data-test="agents-new-token-value"
                            />
                        </AlertDescription>
                    </Alert>
                )}

                <Form
                    {...store.form()}
                    options={{ preserveScroll: true }}
                    resetOnSuccess
                    className="space-y-2"
                >
                    {({ processing, errors }) => (
                        <>
                            <Label htmlFor="token-name">
                                {t('settings.agents.tokens.new')}
                            </Label>
                            <div className="flex gap-2">
                                <Input
                                    id="token-name"
                                    name="name"
                                    required
                                    maxLength={100}
                                    placeholder={t(
                                        'settings.agents.tokens.placeholder',
                                    )}
                                    aria-invalid={!!errors.name}
                                    data-test="agents-token-name"
                                />
                                <Button
                                    type="submit"
                                    disabled={processing}
                                    data-test="agents-token-create"
                                >
                                    {processing && <Spinner />}
                                    {t('settings.agents.tokens.create')}
                                </Button>
                            </div>
                            <InputError message={errors.name} />
                        </>
                    )}
                </Form>

                <AgentAccessList
                    items={tokens}
                    created="settings.agents.created"
                    empty="settings.agents.tokens.empty"
                    data-test="agents-token-list"
                    action={(token) => (
                        <RevokeButton
                            action={destroy(token.id)}
                            label={t('settings.agents.tokens.revoke')}
                            title={t('settings.agents.tokens.revokeTitle', {
                                name: token.name,
                            })}
                            description={t(
                                'settings.agents.tokens.revokeDescription',
                            )}
                            data-test="agents-token-revoke"
                        />
                    )}
                />
            </CardContent>
        </Card>
    );
}
