import { Form, Head, router } from '@inertiajs/react';
import {
    index as confirmOptions,
    store as confirmStore,
} from '@/actions/Laravel/Passkeys/Http/Controllers/PasskeyConfirmationController';
import {
    AuthField,
    AuthStatus,
    AuthSubmit,
    authInputClass,
} from '@/components/auth/auth-form';
import OidcButton, { oidcErrorMessage } from '@/components/auth/oidc-button';
import { FloatingCard } from '@/components/floating-card';
import InputError from '@/components/input-error';
import PasskeyVerify from '@/components/passkey-verify';
import PasswordInput from '@/components/password-input';
import { store } from '@/routes/password/confirm';
import { edit as editProfile } from '@/routes/profile';
import { t } from '@/lib/i18n';

/** Closing goes to the settings the card floats over, not to the protected page. */
function leave(): void {
    router.visit(editProfile(), { replace: true });
}

type Props = {
    /** False for an account created through single sign-on: it confirms at the IdP (or with a passkey). */
    hasPassword: boolean;
    /** The account is linked to the instance's IdP, so logging in there again confirms it is them. */
    canConfirmWithOidc: boolean;
    /** Why the re-authentication at the IdP was turned down. */
    oidcError?: string | null;
};

/**
 * Asked before a sensitive setting (Settings › Security: password, passkeys,
 * two-factor), as a card over the settings.
 */
export default function ConfirmPassword({
    hasPassword = true,
    canConfirmWithOidc = false,
    oidcError,
}: Partial<Props>) {
    const oidcMessage = oidcErrorMessage(oidcError);
    // Without a password nor the IdP (single sign-on was turned off since), the form stays: resetting the password
    // by email is the way back.
    const showPasswordForm = hasPassword || !canConfirmWithOidc;

    return (
        <>
            <Head title={t('auth.confirmPassword')} />

            <FloatingCard
                title={
                    hasPassword
                        ? t('auth.confirmYourPassword')
                        : t('auth.confirmItIsYou')
                }
                description={
                    hasPassword
                        ? t('auth.confirmPasswordDescription')
                        : t('auth.confirmWithSsoDescription')
                }
                onClose={leave}
            >
                {oidcMessage && (
                    <InputError
                        message={oidcMessage}
                        role="alert"
                        className="text-center"
                    />
                )}

                {!hasPassword && !canConfirmWithOidc && (
                    <AuthStatus>{t('auth.confirmNoWayDescription')}</AuthStatus>
                )}

                {canConfirmWithOidc && (
                    <OidcButton confirm primary={!hasPassword} />
                )}

                <PasskeyVerify
                    routes={{
                        options: confirmOptions(),
                        submit: confirmStore(),
                    }}
                    label={t('auth.confirmWithPasskey')}
                    loadingLabel={t('auth.confirming')}
                    separator={
                        showPasswordForm
                            ? t('auth.orConfirmWithPassword')
                            : false
                    }
                />

                {showPasswordForm && (
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
                                        placeholder={t(
                                            'auth.passwordPlaceholder',
                                        )}
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
                )}
            </FloatingCard>
        </>
    );
}
