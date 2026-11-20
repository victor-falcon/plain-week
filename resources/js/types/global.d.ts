import type {
    Account,
    Auth,
    Integrations,
    Mcp,
    Notifications,
    Saas,
} from '@/types/auth';

declare module 'react' {
    interface InputHTMLAttributes<T> {
        passwordrules?: string;
    }
}

declare module '@inertiajs/core' {
    export interface InertiaConfig {
        sharedPageProps: {
            name: string;
            auth: Auth;
            /** Sign-up is open (REGISTRATION_ENABLED, or an instance with no users yet). */
            canRegister: boolean;
            saas: Saas;
            /** "Send feedback" target: a mailto: in SaaS mode, GitHub Discussions otherwise. */
            feedbackUrl: string;
            integrations: Integrations;
            notifications: Notifications;
            mcp: Mcp;
            account: Account | null;
            [key: string]: unknown;
        };
    }
}
