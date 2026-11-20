import { Form, Head, router } from '@inertiajs/react';
import {
    index as confirmOptions,
    store as confirmStore,
} from '@/actions/Laravel/Passkeys/Http/Controllers/PasskeyConfirmationController';
import {
    AuthField,
    AuthSubmit,
    authInputClass,
} from '@/components/auth/auth-form';
import { FloatingCard } from '@/components/floating-card';
import PasskeyVerify from '@/components/passkey-verify';
import PasswordInput from '@/components/password-input';
import { store } from '@/routes/password/confirm';
import { edit as editProfile } from '@/routes/profile';
import { t } from '@/lib/i18n';

/** Closing goes to the settings the card floats over, not to the protected page. */
function leave(): void {
    router.visit(editProfile(), { replace: true });
}

/**
 * Asked before a sensitive setting (Settings › Security: password, passkeys,
 * two-factor), as a card over the settings.
 */
export default function ConfirmPassword() {
    return (
        <>
            <Head title={t('auth.confirmPassword')} />

            <FloatingCard
                title={t('auth.confirmYourPassword')}
                description={t('auth.confirmPasswordDescription')}
                onClose={leave}
            >
                <PasskeyVerify
                    routes={{
                        options: confirmOptions(),
                        submit: confirmStore(),
                    }}
                    label={t('auth.confirmWithPasskey')}
                    loadingLabel={t('auth.confirming')}
                    separator={t('auth.orConfirmWithPassword')}
                />

                <Form
                    {...store.form()}
                    resetOnSuccess={['password']}
                    className="flex flex-col gap-5"
                >
                    {({ processing, errors }) => (
                        <>
                            <AuthField
                                id="password"
                                label={t('auth.password')}
                                error={errors.password}
                            >
                                <PasswordInput
                                    id="password"
                                    name="password"
                                    placeholder={t('auth.passwordPlaceholder')}
                                    autoComplete="current-password"
                                    autoFocus
                                    aria-invalid={!!errors.password}
                                    className={authInputClass}
                                />
                            </AuthField>

                            <AuthSubmit
                                processing={processing}
                                data-test="confirm-password-button"
                            >
                                {t('auth.confirmPassword')}
                            </AuthSubmit>
                        </>
                    )}
                </Form>
            </FloatingCard>
        </>
    );
}
