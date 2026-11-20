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
import { t } from '@/lib/i18n';

type Props = {
    token: string;
    email: string;
    passwordRules: string;
};

export default function ResetPassword({ token, email, passwordRules }: Props) {
    return (
        <>
            <Head title={t('auth.resetPassword')} />

            <FloatingCard
                title={t('auth.chooseNewPassword')}
                description={t('auth.resetPasswordDescription')}
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
                                label={t('auth.email')}
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
                                label={t('auth.newPassword')}
                                error={errors.password}
                            >
                                <PasswordInput
                                    id="password"
                                    name="password"
                                    autoComplete="new-password"
                                    autoFocus
                                    placeholder={t('auth.choosePassword')}
                                    passwordrules={passwordRules}
                                    aria-invalid={!!errors.password}
                                    className={authInputClass}
                                />
                            </AuthField>

                            <AuthField
                                id="password_confirmation"
                                label={t('auth.confirmPassword')}
                                error={errors.password_confirmation}
                            >
                                <PasswordInput
                                    id="password_confirmation"
                                    name="password_confirmation"
                                    autoComplete="new-password"
                                    placeholder={t('auth.repeatPassword')}
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
                                {t('auth.resetPassword')}
                            </AuthSubmit>
                        </>
                    )}
                </Form>
            </FloatingCard>
        </>
    );
}
