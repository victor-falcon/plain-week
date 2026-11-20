import { Form, Head, usePage } from '@inertiajs/react';
import AppLogoIcon from '@/components/app-logo-icon';
import {
    AuthField,
    AuthFootnote,
    AuthStatus,
    AuthSubmit,
    authInputClass,
    closeToPlanner,
} from '@/components/auth/auth-form';
import OidcButton, { oidcErrorMessage } from '@/components/auth/oidc-button';
import { FloatingCard } from '@/components/floating-card';
import InputError from '@/components/input-error';
import PasskeyVerify from '@/components/passkey-verify';
import PasswordInput from '@/components/password-input';
import TextLink from '@/components/text-link';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { register } from '@/routes';
import { store } from '@/routes/login';
import { request } from '@/routes/password';
import { t } from '@/lib/i18n';
import { tRich } from '@/lib/i18n/rich';

type Props = {
    status?: string;
    canResetPassword: boolean;
    /** Why a login through the IdP was turned down (`App\Auth\Oidc\OidcLoginRefused`). */
    oidcError?: string | null;
};

export default function Login({ status, canResetPassword, oidcError }: Props) {
    const { saas, canRegister, oidc } = usePage().props;
    const saasEnabled = saas?.enabled ?? false;
    const oidcEnabled = oidc?.enabled ?? false;
    const oidcOnly = oidcEnabled && (oidc?.only ?? false);
    const oidcMessage = oidcErrorMessage(oidcError);

    return (
        <>
            <Head title={t('auth.logIn')} />

            <FloatingCard
                title={t('auth.welcomeBack')}
                description={
                    oidcOnly
                        ? t('auth.logInWithSsoDescription')
                        : t('auth.logInDescription')
                }
                onClose={closeToPlanner}
                toolbar={<AppLogoIcon className="size-9" aria-hidden />}
            >
                {status && <AuthStatus>{status}</AuthStatus>}

                {oidcMessage && (
                    <InputError
                        message={oidcMessage}
                        role="alert"
                        className="text-center"
                    />
                )}

                {oidcOnly ? (
                    <OidcButton primary />
                ) : (
                    <>
                        {oidcEnabled && <OidcButton />}

                        <PasskeyVerify
                            separator={
                                oidcEnabled
                                    ? t('auth.orLogInWithEmail')
                                    : undefined
                            }
                        />

                        <LoginForm canResetPassword={canResetPassword} />
                    </>
                )}

                {canRegister && (
                    <AuthFootnote>
                        {tRich(
                            saasEnabled
                                ? 'auth.noAccountSyncWeek'
                                : 'auth.noAccountSignUp',
                            {
                                link: (text) => (
                                    <TextLink href={register()}>
                                        {text}
                                    </TextLink>
                                ),
                            },
                        )}
                    </AuthFootnote>
                )}
            </FloatingCard>
        </>
    );
}

/** Email and password (hidden with `OIDC_ONLY`). */
function LoginForm({ canResetPassword }: { canResetPassword: boolean }) {
    return (
        <Form
            {...store.form()}
            resetOnSuccess={['password']}
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
                            required
                            autoFocus
                            autoComplete="email"
                            placeholder={t('auth.emailPlaceholder')}
                            aria-invalid={!!errors.email}
                            className={authInputClass}
                        />
                    </AuthField>

                    <AuthField
                        id="password"
                        label={t('auth.password')}
                        error={errors.password}
                        aside={
                            canResetPassword && (
                                <TextLink
                                    href={request()}
                                    className="text-sm text-muted-foreground"
                                >
                                    {t('auth.forgotIt')}
                                </TextLink>
                            )
                        }
                    >
                        <PasswordInput
                            id="password"
                            name="password"
                            required
                            autoComplete="current-password"
                            placeholder={t('auth.passwordPlaceholder')}
                            aria-invalid={!!errors.password}
                            className={authInputClass}
                        />
                    </AuthField>

                    <div className="flex items-center gap-3">
                        <Checkbox
                            id="remember"
                            name="remember"
                            defaultChecked
                        />
                        <Label htmlFor="remember">{t('auth.rememberMe')}</Label>
                    </div>

                    <AuthSubmit
                        processing={processing}
                        data-test="login-button"
                    >
                        {t('auth.logIn')}
                    </AuthSubmit>
                </>
            )}
        </Form>
    );
}
