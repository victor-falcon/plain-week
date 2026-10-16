import { Form, Head } from '@inertiajs/react';
import {
    AuthField,
    AuthSubmit,
    authInputClass,
    closeToPlanner,
} from '@/components/auth/auth-form';
import { FloatingCard } from '@/components/floating-card';
import PasswordInput from '@/components/password-input';
import { Input } from '@/components/ui/input';
import { update } from '@/routes/password';

type Props = {
    token: string;
    email: string;
    passwordRules: string;
};

export default function ResetPassword({ token, email, passwordRules }: Props) {
    return (
        <>
            <Head title="Reset password" />

            <FloatingCard
                title="Choose a new password"
                description="Then log in with it on every device."
                onClose={closeToPlanner}
            >
                <Form
                    {...update.form()}
                    transform={(data) => ({ ...data, token, email })}
                    resetOnSuccess={['password', 'password_confirmation']}
                    className="flex flex-col gap-5"
                >
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
                                    autoComplete="email"
                                    value={email}
                                    readOnly
                                    className={authInputClass}
                                />
                            </AuthField>

                            <AuthField
                                id="password"
                                label="New password"
                                error={errors.password}
                            >
                                <PasswordInput
                                    id="password"
                                    name="password"
                                    autoComplete="new-password"
                                    autoFocus
                                    placeholder="Choose a password"
                                    passwordrules={passwordRules}
                                    aria-invalid={!!errors.password}
                                    className={authInputClass}
                                />
                            </AuthField>

                            <AuthField
                                id="password_confirmation"
                                label="Confirm password"
                                error={errors.password_confirmation}
                            >
                                <PasswordInput
                                    id="password_confirmation"
                                    name="password_confirmation"
                                    autoComplete="new-password"
                                    placeholder="Repeat it"
                                    passwordrules={passwordRules}
                                    aria-invalid={
                                        !!errors.password_confirmation
                                    }
                                    className={authInputClass}
                                />
                            </AuthField>

                            <AuthSubmit
                                processing={processing}
                                data-test="reset-password-button"
                            >
                                Reset password
                            </AuthSubmit>
                        </>
                    )}
                </Form>
            </FloatingCard>
        </>
    );
}
