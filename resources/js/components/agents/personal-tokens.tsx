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
                <CardTitle>Personal tokens</CardTitle>
                <CardDescription>
                    For agents and apps that send a token instead of signing in.
                    Keep it secret: it gives full access to your planner until
                    you revoke it.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                {newToken !== null && (
                    <Alert data-test="agents-new-token">
                        <KeyRound />
                        <AlertTitle>
                            Copy the token for “{newToken.name}” now
                        </AlertTitle>
                        <AlertDescription className="w-full space-y-2">
                            <p>You won't be able to see it again.</p>
                            <CopyField
                                value={newToken.token}
                                label="Copy token"
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
                            <Label htmlFor="token-name">New token</Label>
                            <div className="flex gap-2">
                                <Input
                                    id="token-name"
                                    name="name"
                                    required
                                    maxLength={100}
                                    placeholder="e.g. Claude Code on my laptop"
                                    aria-invalid={!!errors.name}
                                    data-test="agents-token-name"
                                />
                                <Button
                                    type="submit"
                                    disabled={processing}
                                    data-test="agents-token-create"
                                >
                                    {processing && <Spinner />}
                                    Create
                                </Button>
                            </div>
                            <InputError message={errors.name} />
                        </>
                    )}
                </Form>

                <AgentAccessList
                    items={tokens}
                    created="Created"
                    empty="No personal tokens yet."
                    data-test="agents-token-list"
                    action={(token) => (
                        <RevokeButton
                            action={destroy(token.id)}
                            label="Revoke"
                            title={`Revoke “${token.name}”?`}
                            description="Agents and apps using this token lose access to your planner at once. This can't be undone."
                            data-test="agents-token-revoke"
                        />
                    )}
                />
            </CardContent>
        </Card>
    );
}
