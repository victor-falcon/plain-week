import { Form, Head } from '@inertiajs/react';
import { REGEXP_ONLY_DIGITS } from 'input-otp';
import { useState } from 'react';
import {
    AuthFootnote,
    AuthSubmit,
    authInputClass,
    closeToPlanner,
} from '@/components/auth/auth-form';
import { FloatingCard } from '@/components/floating-card';
import InputError from '@/components/input-error';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    InputOTP,
    InputOTPGroup,
    InputOTPSlot,
} from '@/components/ui/input-otp';
import { OTP_MAX_LENGTH } from '@/hooks/use-two-factor-auth';
import { store } from '@/routes/two-factor/login';
import { t } from '@/lib/i18n';

export default function TwoFactorChallenge() {
    const [showRecoveryInput, setShowRecoveryInput] = useState(false);
    const [code, setCode] = useState('');

    const toggleRecoveryMode = (clearErrors: () => void): void => {
        setShowRecoveryInput(!showRecoveryInput);
        clearErrors();
        setCode('');
    };

    return (
        <>
            <Head title={t('auth.twoFactorTitle')} />

            <FloatingCard
                title={
                    showRecoveryInput
                        ? t('auth.recoveryCode')
                        : t('auth.authenticationCode')
                }
                description={
                    showRecoveryInput
                        ? t('auth.recoveryCodeDescription')
                        : t('auth.authenticationCodeDescription')
                }
                onClose={closeToPlanner}
            >
                <Form
                    {...store.form()}
                    className="flex flex-col gap-5"
                    resetOnError
                    resetOnSuccess={!showRecoveryInput}
                >
                    {({ errors, processing, clearErrors }) => (
                        <>
                            {showRecoveryInput ? (
                                <div className="grid gap-2">
                                    <Input
                                        name="recovery_code"
                                        type="text"
                                        placeholder={t(
                                            'auth.enterRecoveryCode',
                                        )}
                                        aria-label={t('auth.recoveryCode')}
                                        autoFocus
                                        required
                                        aria-invalid={!!errors.recovery_code}
                                        className={authInputClass}
                                    />
                                    <InputError
                                        message={errors.recovery_code}
                                    />
                                </div>
                            ) : (
                                <div className="flex flex-col items-center gap-3 text-center">
                                    <InputOTP
                                        name="code"
                                        maxLength={OTP_MAX_LENGTH}
                                        value={code}
                                        onChange={(value) => setCode(value)}
                                        disabled={processing}
                                        pattern={REGEXP_ONLY_DIGITS}
                                        aria-label={t(
                                            'auth.authenticationCode',
                                        )}
                                        autoFocus
                                    >
                                        <InputOTPGroup>
                                            {Array.from(
                                                { length: OTP_MAX_LENGTH },
                                                (_, index) => (
                                                    <InputOTPSlot
                                                        key={index}
                                                        index={index}
                                                    />
                                                ),
                                            )}
                                        </InputOTPGroup>
                                    </InputOTP>
                                    <InputError message={errors.code} />
                                </div>
                            )}

                            <AuthSubmit processing={processing}>
                                {t('common.continue')}
                            </AuthSubmit>

                            <AuthFootnote>
                                <Button
                                    type="button"
                                    variant="link"
                                    onClick={() =>
                                        toggleRecoveryMode(clearErrors)
                                    }
                                >
                                    {showRecoveryInput
                                        ? t('auth.useAuthenticationCode')
                                        : t('auth.useRecoveryCode')}
                                </Button>
                            </AuthFootnote>
                        </>
                    )}
                </Form>
            </FloatingCard>
        </>
    );
}
