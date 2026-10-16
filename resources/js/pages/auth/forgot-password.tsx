import { Form, Head, router } from '@inertiajs/react';
import {
    AuthField,
    AuthFootnote,
    AuthStatus,
    AuthSubmit,
    authInputClass,
    closeToPlanner,
} from '@/components/auth/auth-form';
import { FloatingCard } from '@/components/floating-card';
import TextLink from '@/components/text-link';
import { Input } from '@/components/ui/input';
import { login } from '@/routes';
import { email } from '@/routes/password';

export default function ForgotPassword({ status }: { status?: string }) {
    return (
        <>
            <Head title="Forgot password" />

            <FloatingCard
                title="Forgot your password?"
                description="Enter your email and we'll send you a link to choose a new one."
                onBack={() => router.visit(login())}
                onClose={closeToPlanner}
            >
                {status && <AuthStatus>{status}</AuthStatus>}

                <Form {...email.form()} className="flex flex-col gap-5">
                    {({ processing, errors }) => (
                        <>
                            <AuthField
                                id="email"
                                label="Email"
                                error={errors.email}
                            >
                                <Input
                                    id="email"
                                    type="email"
                                    name="email"
                                    required
                                    autoComplete="email"
                                    autoFocus
                                    placeholder="you@example.com"
                                    aria-invalid={!!errors.email}
                                    className={authInputClass}
                                />
                            </AuthField>

                            <AuthSubmit
                                processing={processing}
                                data-test="email-password-reset-link-button"
                            >
                                Email reset link
                            </AuthSubmit>
                        </>
                    )}
                </Form>

                <AuthFootnote>
                    Remembered it? <TextLink href={login()}>Log in</TextLink>
                </AuthFootnote>
            </FloatingCard>
        </>
    );
}
