import { Head } from '@inertiajs/react';
import { useState } from 'react';
import AppLogoIcon from '@/components/app-logo-icon';
import { AuthFootnote, AuthSubmit } from '@/components/auth/auth-form';
import { FloatingCard } from '@/components/floating-card';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { approve, deny } from '@/routes/passport/authorizations';

type Props = {
    client: { id: string; name: string };
    /** Where Approve and Deny send the browser back to. */
    redirectHost: string | null;
    account: { name: string; email: string };
    state: string | null;
    authToken: string;
    csrfToken: string;
};

/** The fields Passport's approve and deny endpoints read from the session's request. */
function HiddenFields({
    client,
    state,
    authToken,
    csrfToken,
}: Pick<Props, 'client' | 'state' | 'authToken' | 'csrfToken'>) {
    return (
        <>
            <input type="hidden" name="_token" value={csrfToken} />
            <input type="hidden" name="state" value={state ?? ''} />
            <input type="hidden" name="client_id" value={client.id} />
            <input type="hidden" name="auth_token" value={authToken} />
        </>
    );
}

/**
 * The OAuth consent card an AI agent (an MCP client such as claude.ai) sends
 * the user to before it can use their planner. Approve and Deny are plain
 * form posts: Passport answers them with a redirect back to the app.
 */
export default function Authorize({
    client,
    redirectHost,
    account,
    state,
    authToken,
    csrfToken,
}: Props) {
    const [submitting, setSubmitting] = useState<'approve' | 'deny' | null>(
        null,
    );
    const fields = { client, state, authToken, csrfToken };

    return (
        <>
            <Head title="Connect an app" />

            <FloatingCard
                title={`Connect ${client.name} to Plain Week?`}
                description={`${client.name} will be able to see, add, change and delete the tasks in your planner, as ${account.email}.`}
                toolbar={<AppLogoIcon className="size-9" aria-hidden />}
            >
                <div className="flex flex-col gap-3">
                    <form
                        method="post"
                        action={approve.url()}
                        onSubmit={() => setSubmitting('approve')}
                    >
                        <HiddenFields {...fields} />
                        <AuthSubmit
                            processing={submitting === 'approve'}
                            disabled={submitting !== null}
                            data-test="oauth-approve"
                        >
                            Approve
                        </AuthSubmit>
                    </form>

                    <form
                        {...deny.form()}
                        onSubmit={() => setSubmitting('deny')}
                    >
                        <HiddenFields {...fields} />
                        <Button
                            type="submit"
                            variant="ghost"
                            disabled={submitting !== null}
                            className="h-12 w-full rounded-full text-base font-semibold"
                            data-test="oauth-deny"
                        >
                            {submitting === 'deny' && <Spinner />}
                            Deny
                        </Button>
                    </form>
                </div>

                <AuthFootnote>
                    {redirectHost !== null && (
                        <>
                            You'll go back to{' '}
                            <span className="font-medium text-foreground">
                                {redirectHost}
                            </span>
                            .{' '}
                        </>
                    )}
                    You can disconnect it at any time in Settings › Agents.
                </AuthFootnote>
            </FloatingCard>
        </>
    );
}
