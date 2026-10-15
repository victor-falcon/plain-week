import { Head, Link, usePage } from '@inertiajs/react';
import { Button } from '@/components/ui/button';
import { login, register } from '@/routes';
import { edit as editProfile } from '@/routes/profile';

// Placeholder planner page; the week view (T4) replaces it.
export default function Planner() {
    const { auth, name } = usePage().props;

    return (
        <>
            <Head title="Planner" />
            <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background p-6 text-center text-foreground">
                <h1 className="text-3xl font-semibold tracking-tight">
                    {name}
                </h1>
                <nav className="flex items-center gap-2">
                    {auth.user ? (
                        <Button asChild variant="ghost">
                            <Link href={editProfile()}>Settings</Link>
                        </Button>
                    ) : (
                        <>
                            <Button asChild variant="ghost">
                                <Link href={login()}>Log in</Link>
                            </Button>
                            <Button asChild>
                                <Link href={register()}>Register</Link>
                            </Button>
                        </>
                    )}
                </nav>
            </div>
        </>
    );
}
