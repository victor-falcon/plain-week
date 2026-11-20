import { Form, Head } from '@inertiajs/react';
import {
    AuthFootnote,
    AuthStatus,
    AuthSubmit,
    closeToPlanner,
} from '@/components/auth/auth-form';
import { FloatingCard } from '@/components/floating-card';
import { Button } from '@/components/ui/button';
import { useLogout } from '@/hooks/use-logout';
import { send } from '@/routes/verification';
import { t } from '@/lib/i18n';

export default function VerifyEmail({ status }: { status?: string }) {
    const handleLogout = useLogout();

    return (
        <>
            <Head title={t('auth.emailVerification')} />

            <FloatingCard
                title={t('auth.checkYourEmail')}
                description={t('auth.checkYourEmailDescription')}
                onClose={closeToPlanner}
            >
                {status === 'verification-link-sent' && (
                    <AuthStatus>{t('auth.verificationLinkSent')}</AuthStatus>
                )}

                <Form {...send.form()}>
                    {({ processing }) => (
                        <AuthSubmit processing={processing}>
                            {t('auth.resendVerification')}
                        </AuthSubmit>
                    )}
                </Form>

                <AuthFootnote>
                    <Button variant="link" onClick={handleLogout}>
                        {t('auth.logOut')}
                    </Button>
                </AuthFootnote>
            </FloatingCard>
        </>
    );
}
