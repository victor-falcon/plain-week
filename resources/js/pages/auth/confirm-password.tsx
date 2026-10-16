import { Form, Head } from '@inertiajs/react';
import {
    index as confirmOptions,
    store as confirmStore,
} from '@/actions/Laravel/Passkeys/Http/Controllers/PasskeyConfirmationController';
import {
    AuthField,
    AuthSubmit,
    authInputClass,
    closeToPlanner,
} from '@/components/auth/auth-form';
import { FloatingCard } from '@/components/floating-card';
import PasskeyVerify from '@/components/passkey-verify';
import PasswordInput from '@/components/password-input';
import { store } from '@/routes/password/confirm';

function leave(): void {
    if (window.history.length > 1) {
        window.history.back();
    } else {
        closeToPlanner();
    }
}

/**
 * Asked before a sensitive setting (passkeys, two-factor). It is always
 * reached from inside the app, so closing it goes back there.
 */
export default function ConfirmPassword() {
    return (
        <>
            <Head title="Confirm password" />

            <FloatingCard
                title="Confirm your password"
                description="This is a secure area. Confirm your password before continuing."
                onClose={leave}
            >
                <PasskeyVerify
                    routes={{
                        options: confirmOptions(),
                        submit: confirmStore(),
                    }}
                    label="Confirm with passkey"
                    loadingLabel="Confirming..."
                    separator="Or confirm with password"
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
                                label="Password"
                                error={errors.password}
                            >
                                <PasswordInput
                                    id="password"
                                    name="password"
                                    placeholder="Your password"
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
                                Confirm password
                            </AuthSubmit>
                        </>
                    )}
                </Form>
            </FloatingCard>
        </>
    );
}
