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
import { FloatingCard } from '@/components/floating-card';
import PasskeyVerify from '@/components/passkey-verify';
import PasswordInput from '@/components/password-input';
import TextLink from '@/components/text-link';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { register } from '@/routes';
import { store } from '@/routes/login';
import { request } from '@/routes/password';

type Props = {
    status?: string;
    canResetPassword: boolean;
};

export default function Login({ status, canResetPassword }: Props) {
    const saasEnabled = usePage().props.saas?.enabled ?? false;

    return (
        <>
            <Head title="Log in" />

            <FloatingCard
                title="Welcome back"
                description="Log in to sync your week."
                onClose={closeToPlanner}
                toolbar={<AppLogoIcon className="size-9" aria-hidden />}
            >
                {status && <AuthStatus>{status}</AuthStatus>}

                <PasskeyVerify />

                <Form
                    {...store.form()}
                    resetOnSuccess={['password']}
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
                                    required
                                    autoFocus
                                    autoComplete="email"
                                    placeholder="you@example.com"
                                    aria-invalid={!!errors.email}
                                    className={authInputClass}
                                />
                            </AuthField>

                            <AuthField
                                id="password"
                                label="Password"
                                error={errors.password}
                                aside={
                                    canResetPassword && (
                                        <TextLink
                                            href={request()}
                                            className="text-sm text-muted-foreground"
                                        >
                                            Forgot it?
                                        </TextLink>
                                    )
                                }
                            >
                                <PasswordInput
                                    id="password"
                                    name="password"
                                    required
                                    autoComplete="current-password"
                                    placeholder="Your password"
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
                                <Label htmlFor="remember">Remember me</Label>
                            </div>

                            <AuthSubmit
                                processing={processing}
                                data-test="login-button"
                            >
                                Log in
                            </AuthSubmit>
                        </>
                    )}
                </Form>

                <AuthFootnote>
                    No account yet?{' '}
                    <TextLink href={register()}>
                        {saasEnabled ? 'Sync your week' : 'Sign up'}
                    </TextLink>
                </AuthFootnote>
            </FloatingCard>
        </>
    );
}
