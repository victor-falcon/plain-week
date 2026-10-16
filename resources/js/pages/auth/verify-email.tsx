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

export default function VerifyEmail({ status }: { status?: string }) {
    const handleLogout = useLogout();

    return (
        <>
            <Head title="Email verification" />

            <FloatingCard
                title="Check your email"
                description="Click the link we just emailed you to verify your address."
                onClose={closeToPlanner}
            >
                {status === 'verification-link-sent' && (
                    <AuthStatus>
                        A new verification link has been sent to the email
                        address you signed up with.
                    </AuthStatus>
                )}

                <Form {...send.form()}>
                    {({ processing }) => (
                        <AuthSubmit processing={processing}>
                            Resend verification email
                        </AuthSubmit>
                    )}
                </Form>

                <AuthFootnote>
                    <Button variant="link" onClick={handleLogout}>
                        Log out
                    </Button>
                </AuthFootnote>
            </FloatingCard>
        </>
    );
}
