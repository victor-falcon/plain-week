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
import { t } from '@/lib/i18n';
import { tRich } from '@/lib/i18n/rich';

export default function ForgotPassword({ status }: { status?: string }) {
    return (
        <>
            <Head title={t('auth.forgotPasswordTitle')} />

            <FloatingCard
                title={t('auth.forgotYourPassword')}
                description={t('auth.forgotPasswordDescription')}
                onBack={() => router.visit(login())}
                onClose={closeToPlanner}
            >
                {status && <AuthStatus>{status}</AuthStatus>}

                <Form {...email.form()} className="flex flex-col gap-5">
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
                                    required
                                    autoComplete="email"
                                    autoFocus
                                    placeholder={t('auth.emailPlaceholder')}
                                    aria-invalid={!!errors.email}
                                    className={authInputClass}
                                />
                            </AuthField>

                            <AuthSubmit
                                processing={processing}
                                data-test="email-password-reset-link-button"
                            >
                                {t('auth.emailResetLink')}
                            </AuthSubmit>
                        </>
                    )}
                </Form>

                <AuthFootnote>
                    {tRich('auth.rememberedIt', {
                        link: (text) => (
                            <TextLink href={login()}>{text}</TextLink>
                        ),
                    })}
                </AuthFootnote>
            </FloatingCard>
        </>
    );
}
